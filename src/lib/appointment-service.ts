
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parse, addMinutes, isAfter, isBefore } from 'date-fns';
import type { Doctor, Appointment, TimeSlot } from '@/lib/types';


/**
 * Calculates walk-in token details by interspersing them with advanced bookings.
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

  // Step 1: Get today's availability and generate all possible time slots
  const todaysAvailability = doctor.availabilitySlots?.find(s => s.day === todayDay);
  if (!todaysAvailability || !todaysAvailability.timeSlots?.length) {
    throw new Error('Doctor not available today');
  }
  const allSlots = generateTimeSlots(todaysAvailability.timeSlots, now, doctor.averageConsultingTime);

  // Step 2: Fetch all appointments for today, sorted by their token number
  const appointmentsRef = collection(db, 'appointments');
  const appointmentsQuery = query(
    appointmentsRef,
    where('doctor', '==', doctor.name),
    where('date', '==', todayDate),
    orderBy('numericToken', 'asc')
  );
  const appointmentsSnapshot = await getDocs(appointmentsQuery);
  const appointments = appointmentsSnapshot.docs.map(doc => doc.data() as Appointment);

  // Step 3: Determine the position and time for the new walk-in token
  const totalAppointments = appointments.length;
  const lastAppointment = totalAppointments > 0 ? appointments[totalAppointments - 1] : null;

  let newSlotIndex: number;

  if (!lastAppointment) {
    // No appointments yet, this is the first walk-in. Place it at the current time slot.
    newSlotIndex = findCurrentSlotIndex(allSlots, now);
  } else {
    // There are existing appointments.
    const lastAppointmentTime = parseTime(lastAppointment.time, now);
    const lastAppointmentSlotIndex = findSlotIndexForTime(allSlots, lastAppointmentTime);

    // The next available position is simply one after the last appointment's slot.
    // The walkInTokenAllotment logic is implicitly handled by how many walk-ins are allowed vs advanced bookings.
    // This function's job is to find the *next* logical time.
    newSlotIndex = lastAppointmentSlotIndex + 1;
  }
  
  // Ensure the new slot index is not out of bounds
  if (newSlotIndex >= allSlots.length) {
      throw new Error('No available slots remaining for walk-in today');
  }

  let estimatedTime = allSlots[newSlotIndex];

  // If the calculated time is in the past, adjust to the next available future slot
  if (isBefore(estimatedTime, now)) {
      newSlotIndex = findCurrentSlotIndex(allSlots, now);
      if (newSlotIndex >= allSlots.length) {
          throw new Error('All appointment slots for today have passed.');
      }
      estimatedTime = allSlots[newSlotIndex];
  }


  // Step 4: Calculate the new token number
  const newNumericToken = totalAppointments + 1;

  // Step 5: Calculate patients ahead (all appointments scheduled before the new estimated time)
  const patientsAhead = appointments.filter(apt => {
    const aptTime = parseTime(apt.time, now);
    return isBefore(aptTime, estimatedTime);
  }).length;

  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: newSlotIndex,
  };
}

/**
 * Generates all time slots for today based on availability and doctor's consulting time.
 */
function generateTimeSlots(timeSlots: TimeSlot[], referenceDate: Date, slotDuration: number = 15): Date[] {
  const slots: Date[] = [];
  for (const slot of timeSlots) {
    const startTime = parse(slot.from, 'hh:mm a', referenceDate);
    const endTime = parse(slot.to, 'hh:mm a', referenceDate);

    let currentSlot = startTime;
    while (isBefore(currentSlot, endTime)) {
      slots.push(new Date(currentSlot));
      currentSlot = addMinutes(currentSlot, slotDuration);
    }
  }
  return slots;
}

/**
 * Finds the index of the current or next slot based on the current time.
 */
function findCurrentSlotIndex(slots: Date[], now: Date): number {
  for (let i = 0; i < slots.length; i++) {
    if (isAfter(slots[i], now) || slots[i].getTime() === now.getTime()) {
      return i;
    }
  }
  // If all slots have passed, return an index indicating the end of the list
  return slots.length;
}

/**
 * Finds the index of the slot that matches a given time.
 */
function findSlotIndexForTime(slots: Date[], time: Date): number {
    for (let i = 0; i < slots.length; i++) {
        if (slots[i].getTime() === time.getTime()) {
            return i;
        }
        if (isAfter(slots[i], time)) {
            return i > 0 ? i -1 : 0;
        }
    }
    return slots.length -1;
}


/**
 * Helper function to parse time strings like "09:00 AM" into Date objects.
 */
export function parseTime(timeString: string, referenceDate: Date): Date {
  return parse(timeString, 'hh:mm a', referenceDate);
}
