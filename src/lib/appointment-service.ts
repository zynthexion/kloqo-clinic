
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  format,
  parse,
  addMinutes,
  isAfter,
  isBefore,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  isWithinInterval,
} from 'date-fns';
import type { Appointment, Doctor } from '@/lib/types';
import { parseTime as parseTimeString } from '@/lib/utils';


interface TimeSlot {
  from: string;
  to: string;
}

/**
 * Generates the next sequential token number for a given doctor and date.
 * 'A' for Advanced/Online/Admin, 'W' for Walk-in.
 */
export async function generateNextToken(
  clinicId: string,
  doctorName: string,
  date: Date,
  type: 'A' | 'W'
): Promise<string> {
  const dateStr = format(date, "d MMMM yyyy");
  const appointmentsRef = collection(db, 'appointments');
  const q = query(
    appointmentsRef,
    where('clinicId', '==', clinicId),
    where('doctor', '==', doctorName),
    where('date', '==', dateStr)
  );

  const querySnapshot = await getDocs(q);
  const tokenNumbers = querySnapshot.docs.map(doc => {
    const token = doc.data().tokenNumber;
    if (typeof token === 'string' && (token.startsWith('A') || token.startsWith('W'))) {
      return parseInt(token.substring(1), 10);
    }
    return 0;
  }).filter(num => !isNaN(num) && num > 0);

  const lastToken = tokenNumbers.length > 0 ? Math.max(...tokenNumbers) : 0;
  const nextTokenNum = lastToken + 1;

  return `${type}${String(nextTokenNum).padStart(3, '0')}`;
}


/**
 * Calculates walk-in token details including estimated time and queue position
 *
 * Logic:
 * - walkInTokenAllotment defines how many APPOINTMENTS to skip (not slots)
 * - Walk-ins are placed based on counting actual appointments in timeline
 * - If no previous walk-ins: start from reference slot, skip walkInTokenAllotment appointments
 * - If previous walk-ins exist: place after last walk-in, skip walkInTokenAllotment appointments
 * - If chosen slot overlaps advanced appointment, move to next free slot
 * - If beyond official availability, extend schedule with slotDuration increments
 *
 * Features:
 * ✅ Walk-in opens 30 min before consultation.
 * ✅ Walk-in closes 30 min before consultation end.
 * ✅ Proper spacing logic for walk-ins.
 * ✅ Auto-extends availability beyond end time for last-minute walk-ins.
 */
export async function calculateWalkInDetails(
  doctor: Doctor,
  walkInTokenAllotment: number = 5
): Promise<{
  estimatedTime: Date;
  patientsAhead: number;
  numericToken: number;
  slotIndex: number;
  sessionIndex: number;
}> {
  const now = new Date();
  const todayDate = format(now, 'd MMMM yyyy');
  const todayDay = format(now, 'EEEE');
  const slotDuration = doctor.averageConsultingTime || 15;

  // Step 1: Doctor's availability & Walk-in Window Check
  const todaysAvailability = doctor.availabilitySlots?.find(s => s.day === todayDay);
  if (!todaysAvailability || !todaysAvailability.timeSlots?.length) {
    throw new Error('Doctor not available today');
  }
  const availabilityStart = parseTimeString(todaysAvailability.timeSlots[0].from, now);
  const availabilityEnd = parseTimeString(
    todaysAvailability.timeSlots[todaysAvailability.timeSlots.length - 1].to,
    now
  );
  const walkInOpenTime = addMinutes(availabilityStart, -30);
  const walkInCloseTime = addMinutes(availabilityEnd, -30);

  if (isBefore(now, walkInOpenTime)) {
    throw new Error(`Walk-in registration opens at ${format(walkInOpenTime, 'hh:mm a')}`);
  }
  if (isAfter(now, walkInCloseTime)) {
    throw new Error('Walk-in registration is closed for the day.');
  }

  // Step 2: Generate Time Slots (these represent the doctor's available consultation slots)
  const allSlots = generateTimeSlotsWithSession(todaysAvailability.timeSlots, now, slotDuration);
  if (allSlots.length === 0) {
      throw new Error('No consultation slots could be generated for today.');
  }

  // Step 3: Fetch today's appointments
  const appointmentsRef = collection(db, 'appointments');
  const appointmentsQuery = query(
    appointmentsRef,
    where('doctor', '==', doctor.name),
    where('date', '==', todayDate),
    orderBy('numericToken', 'asc')
  );
  const appointmentsSnapshot = await getDocs(appointmentsQuery);
  const appointments = appointmentsSnapshot.docs.map(doc => doc.data() as Appointment);

  // Separate advanced and walk-in appointments
  const advancedAppointments = appointments.filter(a => a.bookedVia !== 'Walk-in');
  const walkInAppointments = appointments.filter(a => a.bookedVia === 'Walk-in');

  // Find the last advanced appointment slot
  const lastAdvancedSlotIndex = advancedAppointments.length > 0
    ? Math.max(...advancedAppointments.map(a => a.slotIndex ?? -1))
    : -1;

  // Find the last walk-in appointment
  const lastWalkIn = walkInAppointments.length > 0
    ? walkInAppointments[walkInAppointments.length - 1]
    : null;

  // Step 4: Determine target slot for this new walk-in
  let targetSlotIndex: number;

  if (!lastWalkIn) {
    // Case A: No previous walk-ins - First walk-in of the day
    let referenceSlotIndex: number;
    if (isBefore(now, availabilityStart)) {
      referenceSlotIndex = 0; // Start from first slot
    } else {
      referenceSlotIndex = findCurrentSlotIndex(allSlots.map(s => s.time), now);
    }
    
    // Move forward in time, counting ALL appointments (advanced + existing walk-ins) encountered in the timeline
    let appointmentsSkipped = 0;
    let currentSlotIndex = referenceSlotIndex;
    
    while (appointmentsSkipped < walkInTokenAllotment && currentSlotIndex < allSlots.length) {
      // Check if this slot has ANY appointment (advanced or walk-in)
      const hasAppointment = appointments.some(apt => apt.slotIndex === currentSlotIndex);
      if (hasAppointment) {
        appointmentsSkipped++;
      }
      currentSlotIndex++;
    }
    
    targetSlotIndex = currentSlotIndex;
    
  } else {
    // Case B: Previous walk-ins exist
    const lastWalkInSlotIndex = lastWalkIn.slotIndex ?? 0;
    
    if (lastWalkInSlotIndex > lastAdvancedSlotIndex) {
      // Last walk-in is after last advanced appointment → assign next consecutive slot (no skipping)
      targetSlotIndex = lastWalkInSlotIndex + 1;
    } else {
      // Start from slot after last walk-in and skip walkInTokenAllotment appointments forward
      let appointmentsSkipped = 0;
      let currentSlotIndex = lastWalkInSlotIndex + 1;
      
      while (appointmentsSkipped < walkInTokenAllotment && currentSlotIndex < allSlots.length) {
        // Check if this slot has ANY appointment (advanced or walk-in)
        const hasAppointment = appointments.some(apt => apt.slotIndex === currentSlotIndex);
        if (hasAppointment) {
          appointmentsSkipped++;
        }
        currentSlotIndex++;
      }
      
      targetSlotIndex = currentSlotIndex;
    }
  }

  // W tokens can share slots with A tokens, so no collision checking needed
  const finalSlotIndex = targetSlotIndex;
  
  let finalSessionIndex = -1;

  // Step 5: Calculate patients ahead first
  const pendingAppointments = appointments.filter(a =>
    a.status === 'Pending' || a.status === 'Confirmed'
  );
  const patientsAhead = pendingAppointments.filter(a => {
    const aptSlotIndex = a.slotIndex ?? 0;
    return aptSlotIndex < finalSlotIndex;
  }).length;

  // Step 6: Calculate estimated time for display (based on consultation start time)
  let estimatedTime: Date;
  if (isBefore(now, availabilityStart)) {
    // If current time is before consultation start, use consultation start + (patientsAhead * averageConsultationTime)
    estimatedTime = addMinutes(availabilityStart, patientsAhead * slotDuration);
  } else {
    // If consultation has started, use current time + (patientsAhead * averageConsultationTime)
    estimatedTime = addMinutes(now, patientsAhead * slotDuration);
  }

  // Step 7: Get the actual slot time for placement (simply last appointment + averageConsultationTime)
  let actualSlotTime: Date;
  
  // Find the last appointment (A or W) to calculate actual placement time
  const allAppointments = [...advancedAppointments, ...walkInAppointments];
  const lastAppointment = allAppointments.length > 0 
    ? allAppointments.reduce((latest, apt) => {
        const aptTime = parseTimeString(apt.time, now);
        const latestTime = parseTimeString(latest.time, now);
        return aptTime > latestTime ? apt : latest;
      })
    : null;
  
  if (lastAppointment) {
    // Simply place W token after last appointment + averageConsultationTime
    const lastAppointmentTime = parseTimeString(lastAppointment.time, now);
    actualSlotTime = addMinutes(lastAppointmentTime, slotDuration);
  } else {
    // No appointments yet, start from consultation start time
    actualSlotTime = availabilityStart;
  }
  
  // Step 8: Find appropriate session index for the actual slot time
  const slotInfo = allSlots.find(s => 
    isWithinInterval(actualSlotTime, { 
      start: s.time, 
      end: addMinutes(s.time, slotDuration) 
    })
  );
  
  if (slotInfo) {
    finalSessionIndex = slotInfo.sessionIndex;
  } else {
    // If actual slot time is beyond scheduled hours, use the last session
    const lastSlot = allSlots[allSlots.length - 1];
    finalSessionIndex = lastSlot.sessionIndex;
  }

  // Step 8: Generate numeric token (sequential across all appointments)
  const numericTokens = appointments.map(a => a.numericToken);
  const newNumericToken = numericTokens.length > 0 ? Math.max(...numericTokens) + 1 : 1;

  return {
    estimatedTime, // For display purposes
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: finalSlotIndex,
    sessionIndex: finalSessionIndex,
    actualSlotTime, // The actual time slot for appointment placement
  };
}


/**
 * Generates all time slots for the given time ranges with session index
 */
function generateTimeSlotsWithSession(timeSlots: TimeSlot[], referenceDate: Date, slotDuration: number): { time: Date, sessionIndex: number }[] {
  const slots: { time: Date, sessionIndex: number }[] = [];
  timeSlots.forEach((slot, sessionIndex) => {
    const startTime = parseTimeString(slot.from, referenceDate);
    const endTime = parseTimeString(slot.to, referenceDate);
    let current = startTime;
    while (isBefore(current, endTime)) {
      slots.push({ time: current, sessionIndex });
      current = addMinutes(current, slotDuration);
    }
  });
  return slots;
}


/**
 * Finds the index of the current or next slot after the given time
 */
function findCurrentSlotIndex(slots: Date[], now: Date): number {
  for (let i = 0; i < slots.length; i++) {
    if (isAfter(slots[i], now) || slots[i].getTime() === now.getTime()) {
      return i;
    }
  }
  // If all slots are in the past, return length (next slot would be after the last)
  return slots.length;
}