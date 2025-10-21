import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parse, addMinutes, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import type { Doctor, Appointment, TimeSlot } from '@/lib/types';


/**
 * Calculates walk-in token details including estimated time and queue position
 * 
 * Key Logic:
 * - Walk-ins DON'T occupy slots (only booked appointments occupy slots)
 * - BEFORE last advanced appointment: Walk-ins spaced by walkInTokenAllotment (e.g., 5 slots)
 * - AFTER last advanced appointment: Walk-ins can be assigned to consecutive slots
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

  // Step 1: Get today's availability slots
  const todaysAvailability = doctor.availabilitySlots?.find(s => s.day === todayDay);
  
  if (!todaysAvailability || !todaysAvailability.timeSlots?.length) {
    throw new Error('Doctor not available today');
  }

  const allSlots = generateTimeSlots(todaysAvailability.timeSlots, now);

  // Step 2: Fetch all appointments for today
  const appointmentsRef = collection(db, 'appointments');
  const appointmentsQuery = query(
    appointmentsRef,
    where('doctor', '==', doctor.name),
    where('date', '==', todayDate),
    orderBy('numericToken', 'asc')
  );

  const appointmentsSnapshot = await getDocs(appointmentsQuery);
  const appointments = appointmentsSnapshot.docs.map(doc => doc.data() as Appointment);

  // Separate walk-ins and advanced (booked) appointments
  const walkIns = appointments.filter(apt => apt.bookedVia === 'walk-in');
  const advancedAppointments = appointments.filter(apt => 
    apt.tokenNumber?.startsWith('A') || apt.bookedVia === 'online' || apt.bookedVia === 'admin'
  );

  // Step 3: Find the last advanced appointment's slot
  const lastAdvancedSlotIndex = advancedAppointments.length > 0
    ? Math.max(...advancedAppointments.map(apt => apt.slotIndex ?? 0))
    : -1;

  // Step 4: Find the last walk-in
  const lastWalkIn = walkIns.length > 0 ? walkIns[walkIns.length - 1] : null;

  // Step 5: Determine the starting point for the new walk-in
  let startingSlotIndex: number;
  let isAfterAdvancedAppointments = false;

  if (!lastWalkIn) {
    // No previous walk-ins: Start from current time + walkInTokenAllotment slots
    const currentSlotIndex = findCurrentSlotIndex(allSlots, now);
    startingSlotIndex = currentSlotIndex + walkInTokenAllotment;
  } else {
    // Previous walk-ins exist
    const lastWalkInSlotIndex = lastWalkIn.slotIndex ?? findSlotIndexByToken(allSlots, lastWalkIn.numericToken);
    
    // Check if the last walk-in is already after all advanced appointments
    if (lastWalkInSlotIndex > lastAdvancedSlotIndex) {
      // We're already past all advanced appointments - consecutive slots
      isAfterAdvancedAppointments = true;
      startingSlotIndex = lastWalkInSlotIndex + 1;
    } else {
      // Still have advanced appointments ahead - use spacing
      startingSlotIndex = lastWalkInSlotIndex + walkInTokenAllotment;
      
      // Check if this new slot goes past the last advanced appointment
      if (startingSlotIndex > lastAdvancedSlotIndex) {
        isAfterAdvancedAppointments = true;
      }
    }
  }

  // Step 6: Get estimated time for this walk-in
  const { slotIndex: availableSlotIndex, estimatedTime } = getEstimatedTimeForWalkIn(
    allSlots,
    startingSlotIndex,
    now
  );

  // Step 7: Calculate the new token number
  const newNumericToken = appointments.length > 0
    ? Math.max(...appointments.map(a => a.numericToken)) + 1
    : 1;

  // Step 8: Calculate patients ahead (all appointments before this slot)
  const patientsAhead = appointments.filter(apt => {
    const aptSlotIndex = apt.slotIndex ?? 0;
    return aptSlotIndex < availableSlotIndex;
  }).length;

  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: availableSlotIndex,
  };
}

/**
 * Generates all time slots for today based on availability
 */
function generateTimeSlots(timeSlots: TimeSlot[], referenceDate: Date): Date[] {
  const slots: Date[] = [];
  const slotDuration = 15; // minutes

  for (const slot of timeSlots) {
    const startTime = parse(slot.from, 'hh:mm a', referenceDate);
    const endTime = parse(slot.to, 'hh:mm a', referenceDate);

    let currentSlot = startTime;
    while (isBefore(currentSlot, endTime)) {
      slots.push(currentSlot);
      currentSlot = addMinutes(currentSlot, slotDuration);
    }
  }

  return slots;
}

/**
 * Finds the index of the current or next slot
 */
function findCurrentSlotIndex(slots: Date[], now: Date): number {
  for (let i = 0; i < slots.length; i++) {
    if (isAfter(slots[i], now) || slots[i].getTime() === now.getTime()) {
      return i;
    }
  }
  // If all slots have passed, return the last slot index
  return slots.length - 1;
}

/**
 * Finds the slot index based on token number (fallback if slotIndex not stored)
 */
function findSlotIndexByToken(slots: Date[], tokenNumber: number): number {
  // For walk-ins without stored slotIndex, estimate based on token order
  return Math.min(tokenNumber - 1, slots.length - 1);
}

/**
 * Gets the estimated time for walk-in based on slot index
 * Walk-ins don't occupy slots, they just get estimated times
 */
function getEstimatedTimeForWalkIn(
  allSlots: Date[],
  targetSlotIndex: number,
  now: Date
): { slotIndex: number; estimatedTime: Date } {
  // Ensure the slot index is within bounds
  if (targetSlotIndex >= allSlots.length) {
    throw new Error('No available slots remaining for walk-in today');
  }
  
  const clampedIndex = Math.max(0, Math.min(targetSlotIndex, allSlots.length - 1));
  const estimatedTime = allSlots[clampedIndex];

  // If the estimated time has already passed, use next available slot
  if (isBefore(estimatedTime, now)) {
    const currentSlotIndex = findCurrentSlotIndex(allSlots, now);
    if (currentSlotIndex >= allSlots.length) {
      throw new Error('All slots for today have passed');
    }
    return {
      slotIndex: currentSlotIndex,
      estimatedTime: allSlots[currentSlotIndex],
    };
  }

  return {
    slotIndex: clampedIndex,
    estimatedTime,
  };
}

/**
 * Helper function to parse time strings
 */
export function parseTime(timeString: string, referenceDate: Date): Date {
  return parse(timeString, 'hh:mm a', referenceDate);
}
