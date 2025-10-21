import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  format,
  parse,
  addMinutes,
  isAfter,
  isBefore,
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
 * Calculates walk-in token details based on a sophisticated ruleset.
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

  // Rule 1: Check Walk-in Window
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

  // Rule 2: Generate Time Slots
  const allSlots = generateTimeSlots(todaysAvailability.timeSlots, now, slotDuration);
  if (allSlots.length === 0) {
      throw new Error('No consultation slots could be generated for today.');
  }

  // Fetch today's appointments to analyze the queue
  const appointmentsRef = collection(db, 'appointments');
  const appointmentsQuery = query(
    appointmentsRef,
    where('doctor', '==', doctor.name),
    where('date', '==', todayDate),
    orderBy('numericToken', 'asc')
  );
  const appointmentsSnapshot = await getDocs(appointmentsQuery);
  const appointments = appointmentsSnapshot.docs.map(doc => doc.data() as Appointment);

  const advancedAppointments = appointments.filter(a => a.bookedVia !== 'Walk-in');
  const walkIns = appointments.filter(a => a.bookedVia === 'Walk-in');
  
  // Rule 5 (part 1): Create a set of occupied slots by advanced bookings
  const occupiedSlots = new Set(advancedAppointments.map(a => a.slotIndex).filter(i => i !== undefined));

  // Rule 3 & 4: Determine Starting Slot
  const lastAdvancedSlotIndex = advancedAppointments.length > 0
    ? Math.max(...advancedAppointments.map(a => a.slotIndex ?? -1))
    : -1;
  const lastWalkIn = walkIns.length > 0 ? walkIns[walkIns.length - 1] : null;

  let targetSlotIndex: number;

  if (!lastWalkIn) {
    // First walk-in of the day - logic as per user's correct steps
    const referenceSlotIndex = findCurrentSlotIndex(allSlots, now);
    targetSlotIndex = referenceSlotIndex + walkInTokenAllotment;

  } else {
    // Subsequent walk-ins
    const lastWalkInSlotIndex = lastWalkIn.slotIndex ?? 0;
    if (lastWalkInSlotIndex > lastAdvancedSlotIndex) {
      // We are past all advanced bookings, so walk-ins are consecutive
      targetSlotIndex = lastWalkInSlotIndex + 1;
    } else {
      // Still have advanced bookings, so space out the walk-in
      targetSlotIndex = lastWalkInSlotIndex + walkInTokenAllotment;
    }
  }

  // Rule 5 (part 2): Avoid Collisions
  let finalSlotIndex = targetSlotIndex;
  while (occupiedSlots.has(finalSlotIndex)) {
    finalSlotIndex++;
  }

  // Rule 6 & 7: Handle Overflow and Get Estimated Time
  let estimatedTime: Date;
  if (finalSlotIndex >= allSlots.length) {
    // Overflow: extend the schedule
    const lastSlotTime = allSlots[allSlots.length - 1];
    const slotsToAdd = finalSlotIndex - (allSlots.length - 1);
    estimatedTime = addMinutes(lastSlotTime, slotsToAdd * slotDuration);
  } else {
    estimatedTime = allSlots[finalSlotIndex];
  }
  
  // If calculated time is in the past (unlikely with new logic but safe to keep), find next available from now.
  if (isBefore(estimatedTime, now)) {
      let nextAvailableIndex = findCurrentSlotIndex(allSlots, now);
      while(occupiedSlots.has(nextAvailableIndex)) {
          nextAvailableIndex++;
      }
      finalSlotIndex = nextAvailableIndex;
       if (finalSlotIndex >= allSlots.length) {
            const lastSlotTime = allSlots[allSlots.length - 1];
            const slotsToAdd = finalSlotIndex - (allSlots.length - 1);
            estimatedTime = addMinutes(lastSlotTime, slotsToAdd * slotDuration);
       } else {
            estimatedTime = allSlots[finalSlotIndex];
       }
  }

  // Rule 8: Token and Queue
  const numericTokens = appointments.map(a => a.numericToken);
  const newNumericToken = numericTokens.length > 0 ? Math.max(...numericTokens, 0) + 1 : 1;
  const patientsAhead = appointments.filter(a => {
    const aptTime = parseTimeString(a.time, now);
    return isAfter(aptTime, now) && isBefore(aptTime, estimatedTime);
  }).length;
  

  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: finalSlotIndex,
  };
}


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


function findCurrentSlotIndex(slots: Date[], now: Date): number {
  for (let i = 0; i < slots.length; i++) {
    if (isAfter(slots[i], now) || slots[i].getTime() === now.getTime()) return i;
  }
  // If all slots are in the past, return length (next slot would be after the last)
  return slots.length;
}
