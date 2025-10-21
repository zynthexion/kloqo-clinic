
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  format,
  parse,
  addMinutes,
  isAfter,
  isBefore,
} from 'date-fns';
import type { Doctor, Appointment, TimeSlot } from '@/lib/types';


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

  // Step 3: Determine the starting point for the new walk-in
  const lastAppointment = appointments.length > 0 ? appointments[appointments.length - 1] : null;
  const lastAppointmentTime = lastAppointment ? parse(lastAppointment.time, 'hh:mm a', now) : addMinutes(now, -slotDuration);

  // Base time is the later of now or the last appointment time
  const baseTime = isAfter(now, lastAppointmentTime) ? now : lastAppointmentTime;
  const baseSlotIndex = findCurrentSlotIndex(allSlots, baseTime);
  
  const targetSlotIndex = baseSlotIndex + walkInTokenAllotment;

  // Step 4: Get estimated time for this walk-in
  const { slotIndex: availableSlotIndex, estimatedTime } = getEstimatedTimeForWalkIn(
    allSlots,
    targetSlotIndex,
    slotDuration,
    now
  );

  // Step 5: Calculate the new token number
  const newNumericToken =
    appointments.length > 0
      ? Math.max(...appointments.map(a => a.numericToken)) + 1
      : 1;

  // Step 6: Calculate patients ahead (all appointments between now and the estimated time)
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

/**
 * Gets the estimated time for walk-in based on slot index
 */
function getEstimatedTimeForWalkIn(
  allSlots: Date[],
  targetSlotIndex: number,
  slotDuration: number,
  now: Date
): { slotIndex: number; estimatedTime: Date } {

  if (targetSlotIndex >= allSlots.length) {
    // If the target is beyond the scheduled slots, calculate the overflow time
    const lastSlotTime = allSlots[allSlots.length - 1];
    const overflowSlots = targetSlotIndex - (allSlots.length - 1);
    const estimatedTime = addMinutes(lastSlotTime, overflowSlots * slotDuration);
    return { slotIndex: targetSlotIndex, estimatedTime };
  }

  let estimatedTime = allSlots[targetSlotIndex];

  // If the calculated ideal time has already passed, find the next possible slot
  if (isBefore(estimatedTime, now)) {
    const nextAvailableSlotIndex = findCurrentSlotIndex(allSlots, now);
    estimatedTime = allSlots[nextAvailableSlotIndex] || addMinutes(now, slotDuration); // Fallback to now + duration
    return { slotIndex: nextAvailableSlotIndex, estimatedTime };
  }

  return { slotIndex: targetSlotIndex, estimatedTime };
}
