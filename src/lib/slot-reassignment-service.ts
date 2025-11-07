import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  serverTimestamp,
  runTransaction,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  format,
  parse,
  addMinutes,
  isBefore,
  isAfter,
  isSameDay,
  parse as parseDate,
} from 'date-fns';
import type { Appointment, Doctor } from '@/lib/types';
import { parseTime as parseTimeString } from '@/lib/utils';

/**
 * Automatically reassigns W/Confirmed patients to earlier empty slots within the same session.
 * 
 * Rules:
 * - Only reassign W (Walk-in) and Confirmed (A tokens) patients
 * - Never change Pending tokens
 * - Only reassign within the same session index
 * - Prioritize by original appointment time (earliest first)
 * - A tokens (Confirmed) have priority over W tokens
 * - Take the earliest available empty slot
 * - Only same-day slots
 * 
 * Empty slots can be:
 * - Cancelled appointments
 * - No-show appointments
 * - Unbooked slots (never had an appointment)
 */
export async function reassignArrivedPatientsToEmptySlots(
  clinicId: string,
  doctorName: string,
  date: Date,
  sessionIndex: number,
  doctor: Doctor
): Promise<{ reassigned: number; details: string[] }> {
  const dateStr = format(date, "d MMMM yyyy");
  const today = new Date();
  
  // Only process same-day slots
  if (!isSameDay(date, today)) {
    return { reassigned: 0, details: [] };
  }

  try {
    // Step 1: Get all appointments for this doctor, date, and session
    const appointmentsRef = collection(db, 'appointments');
    const appointmentsQuery = query(
      appointmentsRef,
      where('clinicId', '==', clinicId),
      where('doctor', '==', doctorName),
      where('date', '==', dateStr),
      where('sessionIndex', '==', sessionIndex)
    );

    const appointmentsSnapshot = await getDocs(appointmentsQuery);
    const allAppointments = appointmentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Appointment[];

    // Step 2: Identify empty slots (cancelled, no-show, or unbooked)
    const consultationTime = doctor.averageConsultingTime || 15;
    const dayOfWeek = format(date, 'EEEE');
    const availabilityForDay = doctor.availabilitySlots?.find(s => s.day === dayOfWeek);
    
    if (!availabilityForDay || !availabilityForDay.timeSlots[sessionIndex]) {
      return { reassigned: 0, details: [] };
    }

    const session = availabilityForDay.timeSlots[sessionIndex];
    const sessionStart = parseTimeString(session.from, date);
    const sessionEnd = parseTimeString(session.to, date);

    // Generate all possible slots for this session
    const allSlots: { time: Date; slotIndex: number }[] = [];
    let currentTime = sessionStart;
    let globalSlotIndex = 0;

    // Calculate starting global slot index for this session
    for (let i = 0; i < sessionIndex; i++) {
      const prevSession = availabilityForDay.timeSlots[i];
      const prevStart = parseTimeString(prevSession.from, date);
      const prevEnd = parseTimeString(prevSession.to, date);
      let prevTime = prevStart;
      while (isBefore(prevTime, prevEnd)) {
        globalSlotIndex++;
        prevTime = addMinutes(prevTime, consultationTime);
      }
    }

    // Generate slots for this session
    while (isBefore(currentTime, sessionEnd)) {
      allSlots.push({
        time: new Date(currentTime),
        slotIndex: globalSlotIndex
      });
      currentTime = addMinutes(currentTime, consultationTime);
      globalSlotIndex++;
    }

    // Step 3: Map appointments to slots
    const slotToAppointment = new Map<number, Appointment>();
    allAppointments.forEach(apt => {
      if (apt.slotIndex !== undefined) {
        slotToAppointment.set(apt.slotIndex, apt);
      }
    });

    // Step 4: Find empty slots (cancelled, no-show, or unbooked)
    // Empty slots can be filled by arrived patients (W/Confirmed) who are already at the clinic
    // Priority 1: Empty slots within 1-hour window (where A tokens can't book) - W tokens should fill these first
    // Priority 2: Other empty slots (past or current time)
    const emptySlotsWithinOneHour: { time: Date; slotIndex: number }[] = [];
    const emptySlotsOther: { time: Date; slotIndex: number }[] = [];
    const now = new Date();
    const oneHourFromNow = addMinutes(now, 60);
    
    allSlots.forEach(slot => {
      const appointment = slotToAppointment.get(slot.slotIndex);
      
      // Slot is empty if:
      // 1. No appointment exists
      // 2. Appointment is cancelled
      // 3. Appointment is no-show
      const isEmpty = !appointment || 
                     appointment.status === 'Cancelled' || 
                     appointment.status === 'No-show';
      
      if (isEmpty) {
        // Check if slot is within 1-hour window (where A tokens can't book)
        const isWithinOneHour = !isBefore(slot.time, now) && !isAfter(slot.time, oneHourFromNow);
        
        // Check if slot is in the past or current time (arrived patients can fill these)
        const isPastOrCurrent = isBefore(slot.time, now) || slot.time.getTime() <= now.getTime() + 60000;
        
        if (isWithinOneHour) {
          // Priority 1: Empty slots within 1-hour window - W tokens should fill these first
          emptySlotsWithinOneHour.push(slot);
        } else if (isPastOrCurrent) {
          // Priority 2: Other empty slots (past or current time)
          emptySlotsOther.push(slot);
        }
      }
    });
    
    // Combine empty slots with priority: within 1-hour window first, then others
    const emptySlots = [...emptySlotsWithinOneHour, ...emptySlotsOther];

    if (emptySlots.length === 0) {
      return { reassigned: 0, details: [] };
    }

    // Step 5: Find W/Confirmed patients with later slots in the same session
    // Priority: W tokens should move to earlier slots within 1-hour window first
    const arrivedPatients = allAppointments.filter(apt => {
      const aptSlotIndex = apt.slotIndex ?? -1;
      const aptSlot = allSlots.find(s => s.slotIndex === aptSlotIndex);
      
      // Only consider W (Walk-in) and Confirmed (A tokens) patients
      if (apt.status !== 'Confirmed' && apt.bookedVia !== 'Walk-in') {
        return false;
      }
      
      // Only consider patients with later slots (can be moved earlier)
      if (!aptSlot || aptSlotIndex === -1) {
        return false;
      }

      // Check if there's an earlier empty slot available
      // For W tokens, prioritize slots within 1-hour window
      const isWToken = apt.bookedVia === 'Walk-in';
      
      if (isWToken) {
        // W tokens should move to earlier slots within 1-hour window first
        const hasEarlierSlotInOneHour = emptySlotsWithinOneHour.some(emptySlot => 
          emptySlot.slotIndex < aptSlotIndex
        );
        
        // If no slots in 1-hour window, check other empty slots
        const hasEarlierSlotOther = !hasEarlierSlotInOneHour && emptySlotsOther.some(emptySlot => 
          emptySlot.slotIndex < aptSlotIndex
        );
        
        return hasEarlierSlotInOneHour || hasEarlierSlotOther;
      } else {
        // A tokens can move to any earlier empty slot
        const hasEarlierEmptySlot = emptySlots.some(emptySlot => 
          emptySlot.slotIndex < aptSlotIndex
        );
        
        return hasEarlierEmptySlot;
      }
    });

    if (arrivedPatients.length === 0) {
      return { reassigned: 0, details: [] };
    }

    // Step 6: Sort arrived patients for reassignment
    // Priority 1: W tokens that can move to slots within 1-hour window
    // Priority 2: Other W tokens that can move to earlier slots
    // Priority 3: A tokens (Confirmed) that can move to earlier slots
    arrivedPatients.sort((a, b) => {
      const aIsW = a.bookedVia === 'Walk-in';
      const bIsW = b.bookedVia === 'Walk-in';
      const aSlotIndex = a.slotIndex ?? -1;
      const bSlotIndex = b.slotIndex ?? -1;
      
      // Check if they can move to slots within 1-hour window
      const aCanMoveToOneHour = emptySlotsWithinOneHour.some(slot => slot.slotIndex < aSlotIndex);
      const bCanMoveToOneHour = emptySlotsWithinOneHour.some(slot => slot.slotIndex < bSlotIndex);
      
      // Priority 1: W tokens that can move to 1-hour window slots
      if (aIsW && aCanMoveToOneHour && !(bIsW && bCanMoveToOneHour)) return -1;
      if (bIsW && bCanMoveToOneHour && !(aIsW && aCanMoveToOneHour)) return 1;
      
      // Priority 2: Other W tokens
      if (aIsW && !bIsW) return -1;
      if (bIsW && !aIsW) return 1;
      
      // Priority 3: A tokens (Confirmed) - prioritize by original appointment time
      const aIsA = a.bookedVia === 'Advanced Booking' && a.status === 'Confirmed';
      const bIsA = b.bookedVia === 'Advanced Booking' && b.status === 'Confirmed';
      
      if (aIsA && !bIsA) return -1;
      if (!aIsA && bIsA) return 1;
      
      // Then sort by original appointment time (earliest first)
      const aTime = parseTimeString(a.time, parse(a.date, 'd MMMM yyyy', new Date()));
      const bTime = parseTimeString(b.time, parse(b.date, 'd MMMM yyyy', new Date()));
      
      return aTime.getTime() - bTime.getTime();
    });

    // Step 7: Reassign patients to earliest available empty slots
    // Priority: W tokens should move to slots within 1-hour window first
    const reassigned: { appointment: Appointment; newSlotIndex: number; newTime: Date }[] = [];
    const usedEmptySlots = new Set<number>();

    for (const patient of arrivedPatients) {
      const patientSlotIndex = patient.slotIndex ?? -1;
      const isWToken = patient.bookedVia === 'Walk-in';
      
      // For W tokens, prioritize slots within 1-hour window
      // For A tokens, use any earlier empty slot
      let earliestEmptySlot: { time: Date; slotIndex: number } | undefined;
      
      if (isWToken) {
        // W tokens: First try slots within 1-hour window, then other empty slots
        const availableInOneHour = emptySlotsWithinOneHour
          .filter(slot => 
            slot.slotIndex < patientSlotIndex && 
            !usedEmptySlots.has(slot.slotIndex)
          )
          .sort((a, b) => a.slotIndex - b.slotIndex)[0];
        
        if (availableInOneHour) {
          earliestEmptySlot = availableInOneHour;
        } else {
          // If no slots in 1-hour window, use other empty slots
          earliestEmptySlot = emptySlotsOther
            .filter(slot => 
              slot.slotIndex < patientSlotIndex && 
              !usedEmptySlots.has(slot.slotIndex)
            )
            .sort((a, b) => a.slotIndex - b.slotIndex)[0];
        }
      } else {
        // A tokens: Use any earlier empty slot
        earliestEmptySlot = emptySlots
          .filter(slot => 
            slot.slotIndex < patientSlotIndex && 
            !usedEmptySlots.has(slot.slotIndex)
          )
          .sort((a, b) => a.slotIndex - b.slotIndex)[0];
      }

      if (earliestEmptySlot) {
        reassigned.push({
          appointment: patient,
          newSlotIndex: earliestEmptySlot.slotIndex,
          newTime: earliestEmptySlot.time
        });
        usedEmptySlots.add(earliestEmptySlot.slotIndex);
      }
    }

    if (reassigned.length === 0) {
      return { reassigned: 0, details: [] };
    }

    // Step 8: Update appointments in a batch
    // When W tokens move, update slotIndex, time, cutOffTime, and noShowTime
    const batch = writeBatch(db);
    const details: string[] = [];

    for (const { appointment, newSlotIndex, newTime } of reassigned) {
      const appointmentRef = doc(db, 'appointments', appointment.id);
      const newTimeStr = format(newTime, 'hh:mm a');
      
      // Calculate new cut-off time (new appointment time - 15 minutes)
      const newCutOffTime = addMinutes(newTime, -15);
      
      // Calculate new no-show time (new appointment time + 15 minutes)
      const newNoShowTime = addMinutes(newTime, 15);
      
      batch.update(appointmentRef, {
        slotIndex: newSlotIndex,
        time: newTimeStr,
        cutOffTime: newCutOffTime,
        noShowTime: newNoShowTime,
        updatedAt: serverTimestamp()
      });

      details.push(
        `${appointment.tokenNumber} (${appointment.patientName}) moved from slot ${appointment.slotIndex} (${appointment.time}) to slot ${newSlotIndex} (${newTimeStr})`
      );
    }

    await batch.commit();

    return {
      reassigned: reassigned.length,
      details
    };
  } catch (error) {
    console.error('Error reassigning arrived patients to empty slots:', error);
    return { reassigned: 0, details: [] };
  }
}

/**
 * Trigger reassignment when an appointment is cancelled or becomes no-show
 */
export async function triggerReassignmentOnSlotVacancy(
  clinicId: string,
  doctorName: string,
  date: Date,
  sessionIndex: number,
  doctor: Doctor
): Promise<void> {
  try {
    const result = await reassignArrivedPatientsToEmptySlots(
      clinicId,
      doctorName,
      date,
      sessionIndex,
      doctor
    );

    if (result.reassigned > 0) {
      console.log(`Reassigned ${result.reassigned} patients to earlier slots:`, result.details);
    }
  } catch (error) {
    console.error('Error triggering reassignment:', error);
    // Don't throw - this is a background optimization
  }
}

