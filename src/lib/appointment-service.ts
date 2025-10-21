
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { addMinutes, format, isAfter, parse, isBefore } from 'date-fns';
import { db } from './firebase';
import type { Appointment, Doctor } from './types';
import { parseTime } from './utils';

/**
 * Generates all possible 15-minute time slots for a doctor on a given day.
 */
function generateAllTimeSlotsForDay(doctor: Doctor, date: Date): Date[] {
    const dayOfWeek = format(date, 'EEEE');
    const availabilityForDay = doctor.availabilitySlots?.find(slot => slot.day === dayOfWeek);

    if (!availabilityForDay) return [];

    const slots: Date[] = [];
    const consultationTime = doctor.averageConsultingTime || 15;

    availabilityForDay.timeSlots.forEach(timeSlot => {
        let currentTime = parseTime(timeSlot.from, date);
        const endTime = parseTime(timeSlot.to, date);
        while (currentTime < endTime) {
            slots.push(new Date(currentTime));
            currentTime = addMinutes(currentTime, consultationTime);
        }
    });

    return slots;
}

function parseAppointmentDateTime(dateStr: string, timeStr: string): Date {
    return parse(`${dateStr} ${timeStr}`, 'd MMMM yyyy hh:mm a', new Date());
}

/**
 * Calculates walk-in token details including estimated time and queue position
 */
export async function calculateWalkInDetails(
  doctor: Doctor,
  walkInTokenAllotment: number = 3
): Promise<{
  estimatedTime: Date;
  patientsAhead: number;
  numericToken: number;
  slotIndex: number;
}> {
  const now = new Date();
  const todayDateStr = format(now, 'd MMMM yyyy');

  // 1. Fetch all appointments for today to identify booked slots and the last walk-in
  const appointmentsRef = collection(db, 'appointments');
  const q = query(
    appointmentsRef,
    where('doctor', '==', doctor.name),
    where('date', '==', todayDateStr),
    orderBy('numericToken', 'asc')
  );

  const querySnapshot = await getDocs(q);
  const todaysAppointments = querySnapshot.docs.map(doc => doc.data() as Appointment);

  // 2. Separate different types of appointments
  const advancedBookings = todaysAppointments.filter(apt => apt.bookedVia !== 'Walk-in');
  const walkIns = todaysAppointments.filter(apt => apt.bookedVia === 'Walk-in');

  // 3. Generate all possible time slots for the doctor today
  const allPossibleSlots = generateAllTimeSlotsForDay(doctor, now);
  if (allPossibleSlots.length === 0) {
    throw new Error('Doctor has no available slots today.');
  }

  // 4. Get a set of timestamps for already booked advanced appointments
  const bookedTimestamps = new Set(
    advancedBookings.map(apt => parseTime(apt.time, now).getTime())
  );

  // 5. Find the time of the last scheduled appointment (advanced or walk-in)
  const lastAdvancedBookingTime = advancedBookings.length > 0 
    ? parseTime(advancedBookings[advancedBookings.length - 1].time, now)
    : new Date(0);

  const lastWalkIn = walkIns.length > 0 ? walkIns[walkIns.length - 1] : null;
  const lastWalkInTime = lastWalkIn ? parseTime(lastWalkIn.time, now) : new Date(0);
    
  // 6. Determine the starting point for our search
  const searchStartTime = isAfter(now, lastWalkInTime) ? now : lastWalkInTime;

  // Find the index of the slot right after our search start time
  let searchStartIndex = allPossibleSlots.findIndex(slot => isAfter(slot, searchStartTime));
  if (searchStartIndex === -1) {
    searchStartIndex = allPossibleSlots.length; // Start from the end if all slots are in the past
  }

  let finalWalkInSlotIndex = -1;

  // 7. Decide which logic to use: spacing or consecutive
  if (isAfter(searchStartTime, lastAdvancedBookingTime)) {
    // ---- LOGIC 1: AFTER ALL ADVANCED BOOKINGS ARE DONE ----
    // Find the very next consecutive available slot
    for (let i = searchStartIndex; i < allPossibleSlots.length; i++) {
      const slot = allPossibleSlots[i];
      if (!bookedTimestamps.has(slot.getTime())) {
        finalWalkInSlotIndex = i;
        break;
      }
    }
  } else {
    // ---- LOGIC 2: BEFORE THE LAST ADVANCED BOOKING ----
    // Find the next slot after skipping `walkInTokenAllotment` number of *truly available* slots
    let availableSlotsSkipped = 0;
    for (let i = searchStartIndex; i < allPossibleSlots.length; i++) {
      const slot = allPossibleSlots[i];
      if (!bookedTimestamps.has(slot.getTime())) {
        // This is an available slot
        if (availableSlotsSkipped >= walkInTokenAllotment) {
          finalWalkInSlotIndex = i;
          break;
        }
        availableSlotsSkipped++;
      }
    }
  }

  // 8. Handle cases where no slot is found
  if (finalWalkInSlotIndex === -1) {
    // If spacing logic fails (e.g., not enough available slots to skip),
    // find the *very first* available slot after the search start index.
    for (let i = searchStartIndex; i < allPossibleSlots.length; i++) {
        if (!bookedTimestamps.has(allPossibleSlots[i].getTime())) {
            finalWalkInSlotIndex = i;
            break;
        }
    }
    if (finalWalkInSlotIndex === -1) {
        throw new Error('No available walk-in slots remaining for today.');
    }
  }

  const estimatedTime = allPossibleSlots[finalWalkInSlotIndex];

  // 9. Calculate new token number and patients ahead
  const newNumericToken = todaysAppointments.length > 0
    ? Math.max(...todaysAppointments.map(a => a.numericToken)) + 1
    : 1;

  // Count patients with appointments scheduled between now and the user's estimated time
  const patientsAhead = todaysAppointments.filter(apt => {
      const aptTime = parseAppointmentDateTime(apt.date, apt.time);
      const isActive = apt.status !== 'Completed' && apt.status !== 'Cancelled' && apt.status !== 'Skipped';
      return isActive && isAfter(aptTime, now) && isBefore(aptTime, estimatedTime!);
  }).length;
  
  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: finalWalkInSlotIndex,
  };
}

    