
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  format,
  parse,
  addMinutes,
  isAfter,
  isBefore,
} from 'date-fns';
import type { Doctor } from '@/lib/types';

interface TimeSlot {
  from: string;
  to: string;
}

interface Appointment {
  numericToken: number;
  date: string;
  time: string;
  slotIndex?: number;
  bookedVia: string;
  tokenNumber?: string;
}

/**
 * Calculates walk-in token details including estimated time and queue position
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
  if (!todaysAvailability || !todaysAvailability.timeSlots?.length) {
    throw new Error('Doctor not available today');
  }

  const slotDuration = doctor.averageConsultingTime || 5;
  const allSlots = generateTimeSlots(todaysAvailability.timeSlots, now, slotDuration);

  const availabilityStart = parse(todaysAvailability.timeSlots[0].from, 'hh:mm a', now);
  const availabilityEnd = parse(
    todaysAvailability.timeSlots[todaysAvailability.timeSlots.length - 1].to,
    'hh:mm a',
    now
  );

  const walkInOpenTime = addMinutes(availabilityStart, -30);
  const walkInCloseTime = addMinutes(availabilityEnd, -30);

  if (isBefore(now, walkInOpenTime)) {
    throw new Error(`Walk-in booking opens at ${format(walkInOpenTime, 'hh:mm a')}`);
  }
  if (isAfter(now, walkInCloseTime)) {
    throw new Error('Walk-in booking closed for today.');
  }

  // Step 2: Fetch all today's appointments
  const appointmentsRef = collection(db, 'appointments');
  const appointmentsQuery = query(
    appointmentsRef,
    where('doctor', '==', doctor.name),
    where('date', '==', todayDate),
    orderBy('numericToken', 'asc')
  );

  const appointmentsSnapshot = await getDocs(appointmentsQuery);
  const appointments = appointmentsSnapshot.docs.map(doc => doc.data() as Appointment);

  // Step 3: Determine the target slot for the new walk-in
  const { estimatedTime, slotIndex: availableSlotIndex } = getNextWalkInSlot(
    doctor,
    appointments,
    allSlots,
    now,
    walkInTokenAllotment
  );

  // Step 4: Calculate the new token number
  const newNumericToken =
    appointments.length > 0
      ? Math.max(...appointments.map(a => a.numericToken)) + 1
      : 1;

  // Step 5: Calculate patients ahead (all appointments between now and the estimated time)
  const patientsAhead = appointments.filter(apt => {
    try {
      const aptTime = parse(apt.time, 'hh:mm a', now);
      // Count if appointment is between now and the estimated time for the new walk-in
      return isAfter(aptTime, now) && isBefore(aptTime, estimatedTime);
    } catch {
      return false;
    }
  }).length;

  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: availableSlotIndex,
  };
}

function getNextWalkInSlot(
  doctor: Doctor,
  appointments: Appointment[],
  allSlots: Date[],
  now: Date,
  walkInTokenAllotment: number
): { estimatedTime: Date; slotIndex: number } {
  const advancedAppointments = appointments.filter(
    a => a.bookedVia === 'Advanced Booking' || a.tokenNumber?.startsWith('A')
  );
  const lastAdvancedBookingIndex = advancedAppointments.length > 0
    ? Math.max(...advancedAppointments.map(a => a.slotIndex ?? -1))
    : -1;

  const walkIns = appointments.filter(a => a.bookedVia === 'Walk-in');
  const lastWalkIn = walkIns.length > 0 ? walkIns[walkIns.length - 1] : null;

  let targetSlotIndex;

  if (lastWalkIn && lastWalkIn.slotIndex !== undefined) {
    // If there's a previous walk-in, start calculating from there
    targetSlotIndex = lastWalkIn.slotIndex + walkInTokenAllotment;
  } else {
    // This is the first walk-in. Find where to place it.
    const currentSlotIndex = findCurrentSlotIndex(allSlots, now);
    const lastRelevantSlot = Math.max(currentSlotIndex, lastAdvancedBookingIndex);
    targetSlotIndex = lastRelevantSlot + 1; // Start looking from the slot after the latest relevant appointment
  }

  // Find the next available slot that isn't already taken by an advanced booking
  const occupiedSlots = new Set(advancedAppointments.map(a => a.slotIndex));
  while (occupiedSlots.has(targetSlotIndex)) {
    targetSlotIndex++;
  }
  
  const slotDuration = doctor.averageConsultingTime || 5;
  let estimatedTime;
  if (targetSlotIndex >= allSlots.length) {
    // If we've run out of pre-defined slots, extend the schedule
    const lastSlotTime = allSlots[allSlots.length - 1];
    const overflowSlots = targetSlotIndex - (allSlots.length - 1);
    estimatedTime = addMinutes(lastSlotTime, overflowSlots * slotDuration);
  } else {
    estimatedTime = allSlots[targetSlotIndex];
  }

  return { estimatedTime, slotIndex: targetSlotIndex };
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
 * Finds the index of the next available slot
 */
function findCurrentSlotIndex(slots: Date[], now: Date): number {
  for (let i = 0; i < slots.length; i++) {
    if (isAfter(slots[i], now) || slots[i].getTime() === now.getTime()) return i;
  }
  return slots.length - 1;
}
