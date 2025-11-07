/**
 * Walk-in Pool Service
 * 
 * Handles W pool management for walk-in patients before consultation starts
 */

import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  deleteDoc,
  writeBatch,
  Timestamp,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  increment
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateNextTokenAndReserveSlot } from './appointment-service';
import type { Doctor, Patient } from '@/lib/types';
import { parse, format, addMinutes, isBefore } from 'date-fns';

/**
 * Walk-in Pool Entry Interface
 */
export interface WalkInPoolEntry {
  id: string;
  clinicId: string;
  doctorId: string;
  doctorName: string;
  date: string; // "d MMMM yyyy"
  sessionIndex: number;
  patientData: {
    patientId?: string;
    patientName: string;
    age?: number;
    sex?: string;
    place?: string;
    communicationPhone: string;
  };
  registeredAt: Timestamp;
  status: 'waiting' | 'assigned';
  assignedSlotIndex?: number;
  position: number; // Queue position
}

/**
 * Add walk-in patient to the W pool
 * 
 * @param clinicId Clinic ID
 * @param doctor Doctor object
 * @param sessionIndex Session index for the walk-in
 * @param patientData Patient data
 * @returns Created pool entry
 */
export async function addToWalkInPool(
  clinicId: string,
  doctor: Doctor,
  sessionIndex: number,
  patientData: {
    patientId?: string;
    patientName: string;
    age?: number;
    sex?: string;
    place?: string;
    communicationPhone: string;
  }
): Promise<WalkInPoolEntry> {
  const date = new Date();
  const dateStr = formatDate(date);

  // Get current pool entries for this doctor/session to calculate position
  const poolEntries = await getWalkInPool(clinicId, doctor, date, sessionIndex);
  const position = poolEntries.length + 1;

  // Create pool entry
  const poolRef = doc(collection(db, 'walkInPools'));
  const poolEntry: WalkInPoolEntry = {
    id: poolRef.id,
    clinicId,
    doctorId: doctor.id,
    doctorName: doctor.name,
    date: dateStr,
    sessionIndex,
    patientData,
    registeredAt: serverTimestamp() as Timestamp,
    status: 'waiting',
    position,
  };

  await setDoc(poolRef, poolEntry);

  return poolEntry;
}

/**
 * Get walk-in pool entries for a specific doctor and session
 * 
 * @param clinicId Clinic ID
 * @param doctor Doctor object
 * @param date Date object
 * @param sessionIndex Session index
 * @returns Array of pool entries, ordered by registeredAt
 */
export async function getWalkInPool(
  clinicId: string,
  doctor: Doctor,
  date: Date,
  sessionIndex: number
): Promise<WalkInPoolEntry[]> {
  const dateStr = formatDate(date);

  const poolQuery = query(
    collection(db, 'walkInPools'),
    where('clinicId', '==', clinicId),
    where('doctorId', '==', doctor.id),
    where('date', '==', dateStr),
    where('sessionIndex', '==', sessionIndex),
    where('status', '==', 'waiting'),
    orderBy('registeredAt', 'asc')
  );

  const snapshot = await getDocs(poolQuery);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WalkInPoolEntry));
}

/**
 * Assign walk-ins from pool when consultation starts
 * 
 * This function:
 * 1. Gets all waiting walk-ins from the pool
 * 2. Calculates target positions (every 5 appointments with transition logic)
 * 3. Creates appointments and removes from pool
 * 
 * @param clinicId Clinic ID
 * @param doctor Doctor object
 * @param sessionIndex Session index
 * @param activeAppointments Current active appointments for the doctor/date
 * @param allotment Walk-in token allotment (default: 5)
 */
export async function assignWalkInsFromPool(
  clinicId: string,
  doctor: Doctor,
  sessionIndex: number,
  activeAppointments: Array<{
    bookedVia?: string;
    slotIndex?: number;
    sessionIndex?: number;
    doctor: string;
    date: string;
  }>,
  allotment: number = 5
): Promise<void> {
  const date = new Date();
  const dateStr = formatDate(date);

  // Get waiting walk-ins from pool
  const poolEntries = await getWalkInPool(clinicId, doctor, date, sessionIndex);

  if (poolEntries.length === 0) {
    return; // No walk-ins in pool
  }

  // Filter active appointments for this doctor, date, and session
  const sessionAppointments = activeAppointments.filter(
    apt => apt.doctor === doctor.name &&
    apt.date === dateStr &&
    apt.sessionIndex === sessionIndex &&
    (apt.bookedVia === 'Advanced Booking' || apt.bookedVia === 'Walk-in')
  );

  // Find last A token slot index in this session
  const lastAToken = sessionAppointments
    .filter(apt => apt.bookedVia === 'Advanced Booking')
    .reduce((max, apt) => {
      const slotIdx = apt.slotIndex ?? -1;
      return slotIdx > (max?.slotIndex ?? -1) ? apt : max;
    }, null as { slotIndex?: number } | null);

  const lastATokenSlotIndex = lastAToken?.slotIndex ?? -1;

  // Process each walk-in in the pool
  const batch = writeBatch(db);

  for (const poolEntry of poolEntries) {
    try {
      // Calculate target position (every N appointments after last walk-in)
      const walkInAppointments = sessionAppointments.filter(
        apt => apt.bookedVia === 'Walk-in' && (apt.slotIndex ?? -1) >= 0
      );

      let targetSlotIndex: number;

      if (walkInAppointments.length === 0) {
        // First walk-in: place after allotment appointments
        const sortedApts = sessionAppointments
          .filter(apt => apt.bookedVia === 'Advanced Booking')
          .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));

        if (sortedApts.length >= allotment) {
          const lastAptBeforePlacement = sortedApts[allotment - 1];
          targetSlotIndex = (lastAptBeforePlacement.slotIndex ?? 0) + 1;
        } else {
          targetSlotIndex = (sortedApts[sortedApts.length - 1]?.slotIndex ?? 0) + 1;
        }
      } else {
        // Subsequent walk-ins: place after allotment appointments from last walk-in
        const lastWalkIn = walkInAppointments.reduce((max, apt) => {
          const slotIdx = apt.slotIndex ?? -1;
          return slotIdx > (max?.slotIndex ?? -1) ? apt : max;
        }, null as { slotIndex?: number } | null);

        const lastWalkInSlotIndex = lastWalkIn?.slotIndex ?? -1;
        const appointmentsAfterLastW = sessionAppointments.filter(
          apt => (apt.slotIndex ?? -1) > lastWalkInSlotIndex
        );

        if (appointmentsAfterLastW.length >= allotment) {
          const targetApt = appointmentsAfterLastW[allotment - 1];
          targetSlotIndex = (targetApt.slotIndex ?? 0) + 1;
        } else {
          targetSlotIndex = (appointmentsAfterLastW[appointmentsAfterLastW.length - 1]?.slotIndex ?? 0) + 1;
        }
      }

      // Apply transition logic: if target is after last A token, place consecutively
      if (lastATokenSlotIndex >= 0 && targetSlotIndex > lastATokenSlotIndex) {
        targetSlotIndex = lastATokenSlotIndex + 1;
      }

      // Calculate time from slotIndex
      const dayOfWeek = format(date, 'EEEE');
      const availabilityForDay = doctor.availabilitySlots?.find(s => s.day === dayOfWeek);
      if (!availabilityForDay || !availabilityForDay.timeSlots) {
        throw new Error('Doctor not available on this date');
      }

      // Generate all slots to find the time for targetSlotIndex
      const allSlots = generateTimeSlotsWithSession(availabilityForDay.timeSlots, date, doctor.averageConsultingTime || 15);
      const targetSlot = allSlots[targetSlotIndex];
      
      if (!targetSlot) {
        // If slotIndex is beyond available slots, use last slot
        const lastSlot = allSlots[allSlots.length - 1];
        if (!lastSlot) {
          throw new Error('No slots available for this session');
        }
        targetSlotIndex = allSlots.length - 1;
        const finalSlot = allSlots[targetSlotIndex];
        const slotTime = format(finalSlot.time, 'hh:mm a');
        
        // Generate token and reserve slot
        const { tokenNumber, numericToken } = await generateNextTokenAndReserveSlot(
          clinicId,
          doctor.name,
          date,
          'W',
          {
            time: slotTime,
            slotIndex: targetSlotIndex
          }
        );
        
        // Create appointment
        const appointmentRef = doc(collection(db, 'appointments'));
        const appointmentData = {
          id: appointmentRef.id,
          clinicId,
          doctorId: doctor.id,
          doctor: doctor.name,
          date: dateStr,
          department: doctor.department || '',
          patientId: poolEntry.patientData.patientId || '',
          patientName: poolEntry.patientData.patientName,
          age: poolEntry.patientData.age,
          sex: poolEntry.patientData.sex,
          place: poolEntry.patientData.place,
          communicationPhone: poolEntry.patientData.communicationPhone,
          status: 'Pending',
          bookedVia: 'Walk-in',
          tokenNumber,
          numericToken,
          slotIndex: targetSlotIndex,
          sessionIndex: finalSlot.sessionIndex,
          time: slotTime,
          treatment: 'General Consultation',
          createdAt: serverTimestamp(),
        };

        batch.set(appointmentRef, appointmentData);

        // Update patient document if patientId exists
        if (poolEntry.patientData.patientId) {
          const patientRef = doc(db, 'patients', poolEntry.patientData.patientId);
          batch.update(patientRef, {
            visitHistory: arrayUnion(appointmentRef.id),
            totalAppointments: increment(1),
            clinicIds: arrayUnion(clinicId),
            updatedAt: serverTimestamp(),
          });
        }

        // Mark pool entry as assigned and remove from pool
        const poolRef = doc(db, 'walkInPools', poolEntry.id);
        batch.delete(poolRef);
        continue;
      }
      
      const slotTime = format(targetSlot.time, 'hh:mm a');

      // Generate token and reserve slot
      const { tokenNumber, numericToken } = await generateNextTokenAndReserveSlot(
        clinicId,
        doctor.name,
        date,
        'W',
        {
          time: slotTime,
          slotIndex: targetSlotIndex
        }
      );

      // Create appointment
      const appointmentRef = doc(collection(db, 'appointments'));
      const appointmentData = {
        id: appointmentRef.id,
        clinicId,
        doctorId: doctor.id,
        doctor: doctor.name,
        date: dateStr,
        department: doctor.department || '',
        patientId: poolEntry.patientData.patientId || '',
        patientName: poolEntry.patientData.patientName,
        age: poolEntry.patientData.age,
        sex: poolEntry.patientData.sex,
        place: poolEntry.patientData.place,
        communicationPhone: poolEntry.patientData.communicationPhone,
        status: 'Pending',
        bookedVia: 'Walk-in',
        tokenNumber,
        numericToken,
        slotIndex: targetSlotIndex,
        sessionIndex: targetSlot.sessionIndex,
        time: slotTime,
        treatment: 'General Consultation',
        createdAt: serverTimestamp(),
      };

      batch.set(appointmentRef, appointmentData);

      // Update patient document if patientId exists
      if (poolEntry.patientData.patientId) {
        const patientRef = doc(db, 'patients', poolEntry.patientData.patientId);
        batch.update(patientRef, {
          visitHistory: arrayUnion(appointmentRef.id),
          totalAppointments: increment(1),
          clinicIds: arrayUnion(clinicId),
          updatedAt: serverTimestamp(),
        });
      }

      // Mark pool entry as assigned and remove from pool
      const poolRef = doc(db, 'walkInPools', poolEntry.id);
      batch.delete(poolRef);

    } catch (error) {
      console.error(`Error assigning walk-in from pool ${poolEntry.id}:`, error);
      // Continue with next entry even if one fails
    }
  }

  await batch.commit();
}

/**
 * Remove walk-in from pool (e.g., if they cancel or leave)
 * 
 * @param poolEntryId Pool entry ID to remove
 */
export async function removeFromWalkInPool(poolEntryId: string): Promise<void> {
  await deleteDoc(doc(db, 'walkInPools', poolEntryId));
}

/**
 * Check if consultation has started for a specific session
 * 
 * @param doctor Doctor object
 * @param sessionIndex Session index
 * @param date Date to check
 * @returns True if consultation has started, false otherwise
 */
export function hasConsultationStarted(
  doctor: Doctor,
  sessionIndex: number,
  date: Date = new Date()
): boolean {
  if (!doctor.availabilitySlots) return false;
  
  const dayOfWeek = format(date, 'EEEE');
  const availabilityForDay = doctor.availabilitySlots.find(s => s.day === dayOfWeek);
  if (!availabilityForDay || !availabilityForDay.timeSlots) return false;
  
  const session = availabilityForDay.timeSlots[sessionIndex];
  if (!session) return false;
  
  const now = new Date();
  const sessionStart = parseTimeString(session.from, date);
  
  return now >= sessionStart;
}

/**
 * Helper function to parse time string to Date
 */
function parseTimeString(timeStr: string, date: Date): Date {
  return parse(timeStr, 'hh:mm a', date);
}

/**
 * Helper function to format date as "d MMMM yyyy"
 */
function formatDate(date: Date): string {
  return format(date, 'd MMMM yyyy');
}

/**
 * Generate all time slots for the given time ranges with session index
 */
function generateTimeSlotsWithSession(
  timeSlots: Array<{ from: string; to: string }>,
  referenceDate: Date,
  slotDuration: number
): Array<{ time: Date; sessionIndex: number }> {
  const slots: Array<{ time: Date; sessionIndex: number }> = [];
  timeSlots.forEach((slot, sessionIndex) => {
    const startTime = parseTimeString(slot.from, referenceDate);
    const endTime = parseTimeString(slot.to, referenceDate);
    let current = new Date(startTime);
    while (isBefore(current, endTime)) {
      slots.push({ time: new Date(current), sessionIndex });
      current = addMinutes(current, slotDuration);
    }
  });
  return slots;
}

