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
import type { Doctor, Appointment, TimeSlot } from '@/lib/types';

/**
 * Calculates walk-in token details including estimated time and queue position
 *
 * Features:
 * ✅ Walk-in opens 30 min before consultation
 * ✅ Walk-in closes 30 min before consultation end
 * ✅ After last advanced appointment: consecutive assignment
 * ✅ Before last advanced appointment: spaced by `walkInTokenAllotment` slots
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

  // Step 1: Doctor’s availability & Slot Generation
  const todaysAvailability = doctor.availabilitySlots?.find(s => s.day === todayDay);
  if (!todaysAvailability || !todaysAvailability.timeSlots?.length)
    throw new Error('Doctor not available today');

  const slotDuration = doctor.averageConsultingTime || 15;
  const allSlots = generateTimeSlots(todaysAvailability.timeSlots, now, slotDuration);
  if (allSlots.length === 0) {
    throw new Error('Doctor has no available time slots today');
  }

  const availabilityStart = allSlots[0];
  const availabilityEnd = addMinutes(allSlots[allSlots.length - 1], slotDuration);

  // Step 2: Walk-in open/close times
  const walkInOpenTime = addMinutes(availabilityStart, -30);
  const walkInCloseTime = addMinutes(availabilityEnd, -30);

  if (isBefore(now, walkInOpenTime)) {
    throw new Error(`Walk-in booking opens at ${format(walkInOpenTime, 'hh:mm a')}`);
  }
  if (isAfter(now, walkInCloseTime)) {
    throw new Error('Walk-in booking for today is closed');
  }

  // Step 3: Fetch all today's appointments
  const appointmentsRef = collection(db, 'appointments');
  const appointmentsQuery = query(
    appointmentsRef,
    where('doctor', '==', doctor.name),
    where('date', '==', todayDate),
    orderBy('numericToken', 'asc')
  );

  const appointmentsSnapshot = await getDocs(appointmentsQuery);
  const appointments = appointmentsSnapshot.docs.map(doc => doc.data() as Appointment);

  const walkIns = appointments.filter(a => a.bookedVia?.toLowerCase() === 'walk-in');
  const advancedAppointments = appointments.filter(
    a =>
      a.bookedVia === 'Advanced Booking' ||
      a.bookedVia === 'online' ||
      a.bookedVia === 'admin' ||
      a.tokenNumber?.startsWith('A')
  );
  
  const occupiedSlots = new Set(advancedAppointments.map(a => a.slotIndex).filter(idx => idx !== undefined));

  // Step 4: Determine starting slot for the new walk-in
  let targetSlotIndex: number;

  if (walkIns.length === 0) {
    // First walk-in of the day
    const currentSlotIndex = findCurrentSlotIndex(allSlots, now);
    const lastAdvancedSlotIndex = advancedAppointments.length > 0
      ? Math.max(...advancedAppointments.map(a => a.slotIndex ?? -1))
      : -1;
    
    // Start calculating from whichever is later: the current time or the last booked slot.
    const baseSlotIndex = Math.max(currentSlotIndex, lastAdvancedSlotIndex);
    targetSlotIndex = baseSlotIndex + walkInTokenAllotment;

  } else {
    // There are existing walk-ins
    const lastWalkIn = walkIns[walkIns.length - 1];
    const lastWalkInSlotIndex = lastWalkIn.slotIndex ?? findSlotIndexByToken(allSlots, lastWalkIn.numericToken);
    const lastAdvancedSlotIndex = advancedAppointments.length > 0
        ? Math.max(...advancedAppointments.map(a => a.slotIndex ?? -1))
        : -1;

    if (lastWalkInSlotIndex > lastAdvancedSlotIndex) {
      // If the last walk-in is already past all advanced bookings, schedule consecutively.
      targetSlotIndex = lastWalkInSlotIndex + 1;
    } else {
      // Otherwise, space it out.
      targetSlotIndex = lastWalkInSlotIndex + walkInTokenAllotment;
    }
  }

  // Step 5: Find the next available slot, avoiding collisions with advanced bookings
  let finalSlotIndex = targetSlotIndex;
  while (occupiedSlots.has(finalSlotIndex)) {
    finalSlotIndex++;
  }

  // Step 6: Calculate estimated time, handling overflow
  let estimatedTime: Date;
  if (finalSlotIndex >= allSlots.length) {
    const lastSlotTime = allSlots[allSlots.length - 1];
    const overflowSlots = finalSlotIndex - (allSlots.length - 1);
    estimatedTime = addMinutes(lastSlotTime, overflowSlots * slotDuration);
  } else {
    estimatedTime = allSlots[finalSlotIndex];
  }

  // Ensure estimated time is not in the past
  if (isBefore(estimatedTime, now)) {
    const currentSlotIndex = findCurrentSlotIndex(allSlots, now);
    let nextAvailableIndex = currentSlotIndex;
    while(occupiedSlots.has(nextAvailableIndex)) {
        nextAvailableIndex++;
    }
    finalSlotIndex = nextAvailableIndex;
    estimatedTime = allSlots[finalSlotIndex] || addMinutes(allSlots[allSlots.length - 1], (finalSlotIndex - allSlots.length + 1) * slotDuration);
  }

  // Step 7: Generate new numeric token
  const newNumericToken =
    appointments.length > 0 ? Math.max(...appointments.map(a => a.numericToken)) + 1 : 1;

  // Step 8: Calculate queue position accurately
  const patientsAhead = appointments.filter(a => {
      const aptTime = parse(a.time, 'hh:mm a', now);
      return isAfter(aptTime, now) && isBefore(aptTime, estimatedTime);
  }).length;


  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: finalSlotIndex,
  };
}

/**
 * Generates slots dynamically based on time ranges and duration
 */
function generateTimeSlots(timeSlots: TimeSlot[], referenceDate: Date, slotDuration: number): Date[] {
  const slots: Date[] = [];
  for (const slot of timeSlots) {
    const startTime = parse(slot.from, 'hh:mm a', referenceDate);
    const endTime = parse(slot.to, 'hh:mm a', referenceDate);
    let current = startTime;
    while (isBefore(current, endTime)) {
      slots.push(new Date(current));
      current = addMinutes(current, slotDuration);
    }
  }
  return slots;
}

/**
 * Finds the index of the current or next slot
 */
function findCurrentSlotIndex(slots: Date[], now: Date): number {
  for (let i = 0; i < slots.length; i++) {
    if (isAfter(slots[i], now) || slots[i].getTime() === now.getTime()) return i;
  }
  return slots.length; // Return next index if all have passed
}

/**
 * Estimate slot index by token (fallback)
 */
function findSlotIndexByToken(slots: Date[], tokenNumber: number): number {
  return Math.min(tokenNumber - 1, slots.length - 1);
}
