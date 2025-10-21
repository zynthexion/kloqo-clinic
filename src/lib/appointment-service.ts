
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
 * - Advanced appointments occupy slots
 * - Walk-ins do NOT occupy slots—they get estimated times based on available slots
 * - Before last advanced appointment: Walk-ins spaced by `walkInTokenAllotment` slots
 * - After last advanced appointment: Walk-ins placed consecutively
 * 
 * Features:
 * ✅ Walk-in opens 30 min before consultation
 * ✅ Walk-in closes 30 min before consultation end
 * ✅ Proper spacing logic for walk-ins
 * ✅ Auto-extends availability beyond end time for last-minute walk-ins
 */
export async function calculateWalkInDetails(
  doctor: Doctor,
  walkInTokenAllotment: number = 5
): Promise<{
  estimatedTime: Date;
  patientsAhead: number;
  numericToken: number;
  slotIndex: number;
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
  const allSlots = generateTimeSlots(todaysAvailability.timeSlots, now, slotDuration);
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
  
  // Advanced appointments occupy actual slots
  const occupiedSlots = new Set(advancedAppointments.map(a => a.slotIndex).filter(i => i !== undefined));
  
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
    
    // Determine reference slot (starting point)
    let referenceSlotIndex: number;
    if (isBefore(now, availabilityStart)) {
      // Current time is before availability start
      referenceSlotIndex = 0; // Start from first slot
    } else {
      // Current time is after availability start - find next slot after now
      referenceSlotIndex = findCurrentSlotIndex(allSlots, now);
    }
    
    // Place walk-in at (referenceSlot + walkInTokenAllotment)
    // This ensures spacing from the start
    targetSlotIndex = referenceSlotIndex + walkInTokenAllotment;
    
  } else {
    // Case B: Previous walk-ins exist
    const lastWalkInSlotIndex = lastWalkIn.slotIndex ?? 0;
    
    if (lastWalkInSlotIndex > lastAdvancedSlotIndex) {
      // Last walk-in is already after all advanced appointments
      // Place consecutively (no spacing needed)
      targetSlotIndex = lastWalkInSlotIndex + 1;
    } else {
      // Last walk-in is before the last advanced appointment
      // Apply spacing to avoid crowding scheduled patients
      targetSlotIndex = lastWalkInSlotIndex + walkInTokenAllotment;
    }
  }

  // Step 5: Skip over any occupied slots (advanced appointments)
  // Walk-ins don't occupy slots themselves, but we can't assign them to times when advanced appointments exist
  let finalSlotIndex = targetSlotIndex;
  while (occupiedSlots.has(finalSlotIndex)) {
    finalSlotIndex++;
  }

  // Step 6: Calculate estimated time based on final slot index
  let estimatedTime: Date;
  if (finalSlotIndex >= allSlots.length) {
    // Extend beyond doctor's scheduled hours
    const lastSlotTime = allSlots[allSlots.length - 1];
    const slotsToAdd = finalSlotIndex - (allSlots.length - 1);
    estimatedTime = addMinutes(lastSlotTime, slotsToAdd * slotDuration);
  } else {
    estimatedTime = allSlots[finalSlotIndex];
  }
  
  // Step 7: Ensure estimated time is not in the past
  if (isBefore(estimatedTime, now)) {
    // Find the next available slot from current time
    let nextAvailableFromNow = findCurrentSlotIndex(allSlots, now);
    
    // Skip occupied slots
    while (occupiedSlots.has(nextAvailableFromNow)) {
      nextAvailableFromNow++;
    }
    
    finalSlotIndex = nextAvailableFromNow;
    
    if (finalSlotIndex >= allSlots.length) {
      const lastSlotTime = allSlots[allSlots.length - 1];
      const slotsToAdd = finalSlotIndex - (allSlots.length - 1);
      estimatedTime = addMinutes(lastSlotTime, slotsToAdd * slotDuration);
    } else {
      estimatedTime = allSlots[finalSlotIndex];
    }
  }

  // Step 8: Generate numeric token (sequential across all appointments)
  const numericTokens = appointments.map(a => a.numericToken);
  const newNumericToken = numericTokens.length > 0 ? Math.max(...numericTokens) + 1 : 1;
  
  // Step 9: Calculate patients ahead
  // Count all pending/confirmed appointments (both advanced and walk-in) with earlier slot indices
  const pendingAppointments = appointments.filter(a => 
    a.status === 'Pending' || a.status === 'Confirmed'
  );
  const patientsAhead = pendingAppointments.filter(a => {
    const aptSlotIndex = a.slotIndex ?? 0;
    return aptSlotIndex < finalSlotIndex;
  }).length;

  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: finalSlotIndex,
  };
}


/**
 * Generates all time slots for the given time ranges
 */
function generateTimeSlots(timeSlots: TimeSlot[], referenceDate: Date, slotDuration: number): Date[] {
  const slots: Date[] = [];
  for (const slot of timeSlots) {
    const startTime = parseTimeString(slot.from, referenceDate);
    const endTime = parseTimeString(slot.to, referenceDate);
    let current = startTime;
    while (isBefore(current, endTime)) {
      slots.push(current);
      current = addMinutes(current, slotDuration);
    }
  }
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
