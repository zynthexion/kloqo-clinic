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

  // Step 1: Doctor’s availability
  const todaysAvailability = doctor.availabilitySlots?.find(s => s.day === todayDay);
  if (!todaysAvailability || !todaysAvailability.timeSlots?.length)
    throw new Error('Doctor not available today');

  const slotDuration = doctor.averageConsultingTime || 5; // minutes
  const allSlots = generateTimeSlots(todaysAvailability.timeSlots, now, slotDuration);

  // Determine availability start & end times
  const availabilityStart = parse(todaysAvailability.timeSlots[0].from, 'hh:mm a', now);
  const availabilityEnd = parse(
    todaysAvailability.timeSlots[todaysAvailability.timeSlots.length - 1].to,
    'hh:mm a',
    now
  );

  // Step 2: Walk-in open/close times
  const walkInOpenTime = addMinutes(availabilityStart, -30);
  const walkInCloseTime = addMinutes(availabilityEnd, -30);

  // Check if walk-in is allowed
  if (isBefore(now, walkInOpenTime)) {
    throw new Error('Walk-in booking not yet open');
  }

  if (isAfter(now, walkInCloseTime)) {
    throw new Error('Walk-in booking closed for today');
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

  // Step 4: Find last advanced and last walk-in
  const lastAdvancedSlotIndex =
    advancedAppointments.length > 0
      ? Math.max(...advancedAppointments.map(a => a.slotIndex ?? 0))
      : -1;

  const lastWalkIn = walkIns.length > 0 ? walkIns[walkIns.length - 1] : null;

  // Step 5: Determine new walk-in slot
  let targetSlotIndex: number;

  if (!lastWalkIn) {
      // First walk-in of the day
      const currentSlotIndex = findCurrentSlotIndex(allSlots, now);
      const advancedBookingsAfterNow = advancedAppointments.filter(
          a => (a.slotIndex ?? 0) >= currentSlotIndex
      ).length;

      // The target is `walkInTokenAllotment` slots after the current time, plus any advanced bookings in that window.
      targetSlotIndex = currentSlotIndex + walkInTokenAllotment + advancedBookingsAfterNow;
  } else {
    const lastWalkInSlot = lastWalkIn.slotIndex ?? findSlotIndexByToken(allSlots, lastWalkIn.numericToken);
    if (lastWalkInSlot > lastAdvancedSlotIndex) {
      // Already past all advanced bookings, so just take the next slot
      targetSlotIndex = lastWalkInSlot + 1;
    } else {
      // Still within advanced bookings, space it out
      targetSlotIndex = lastWalkInSlot + walkInTokenAllotment;
    }
  }


  // Step 6: Calculate estimated time
  let { slotIndex: availableSlotIndex, estimatedTime } = getEstimatedTimeForWalkIn(
    allSlots,
    targetSlotIndex,
    now
  );

  // Step 7: Handle overflow beyond availability end (auto-extension)
  if (isAfter(estimatedTime, availabilityEnd)) {
    const overflowMinutes = differenceInMinutes(estimatedTime, availabilityEnd);
    estimatedTime = addMinutes(availabilityEnd, overflowMinutes);
  }

  // Step 8: Generate new numeric token
  const newNumericToken =
    appointments.length > 0 ? Math.max(...appointments.map(a => a.numericToken)) + 1 : 1;

  // Step 9: Calculate queue position
  const patientsAhead = appointments.filter(a => {
      const aptTime = parse(a.time, "hh:mm a", now);
      return isBefore(aptTime, estimatedTime);
  }).length;


  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: availableSlotIndex,
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
      slots.push(current);
      current = addMinutes(current, slotDuration);
    }
  }
  return slots;
}

/**
 * Finds the index of the next available slot
 */
function findCurrentSlotIndex(slots: Date[], now: Date): number {
  for (let i = 0; i < slots.length; i++) {
    if (isAfter(slots[i], now) || slots[i].getTime() === now.getTime()) return i;
  }
  return slots.length - 1;
}

/**
 * Estimate slot index by token (fallback)
 */
function findSlotIndexByToken(slots: Date[], tokenNumber: number): number {
  return Math.min(tokenNumber - 1, slots.length - 1);
}

/**
 * Get estimated walk-in time (ensures valid slot)
 */
function getEstimatedTimeForWalkIn(
  allSlots: Date[],
  targetSlotIndex: number,
  now: Date
): { slotIndex: number; estimatedTime: Date } {
    if (targetSlotIndex >= allSlots.length) {
        // If the target is beyond available slots, create a new theoretical slot
        const lastSlot = allSlots[allSlots.length - 1];
        const slotDuration = allSlots.length > 1 ? differenceInMinutes(allSlots[1], allSlots[0]) : 15;
        const slotsToAdd = targetSlotIndex - (allSlots.length - 1);
        const estimatedTime = addMinutes(lastSlot, slotsToAdd * slotDuration);
        return { slotIndex: targetSlotIndex, estimatedTime };
    }


  const clampedIndex = Math.max(0, Math.min(targetSlotIndex, allSlots.length - 1));
  const estimatedTime = allSlots[clampedIndex];

  if (isBefore(estimatedTime, now)) {
    const currentIndex = findCurrentSlotIndex(allSlots, now);
    return { slotIndex: currentIndex, estimatedTime: allSlots[currentIndex] };
  }

  return { slotIndex: clampedIndex, estimatedTime };
}
