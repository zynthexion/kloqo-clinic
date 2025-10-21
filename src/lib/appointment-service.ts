
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

  const slotDuration = doctor.averageConsultingTime || 5; // Default to 5 minutes
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

  if (isBefore(now, walkInOpenTime)) {
    throw new Error(`Walk-in booking opens at ${format(walkInOpenTime, 'hh:mm a')}`);
  }

  if (isAfter(now, walkInCloseTime)) {
    throw new Error('Walk-in booking is closed for today.');
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
  const occupiedSlotIndexes = new Set(appointments.map(a => a.slotIndex).filter(idx => idx !== undefined));


  // Step 4: Find the last walk-in to determine the next position
  const lastWalkIn = appointments
    .filter(a => a.bookedVia?.toLowerCase() === 'walk-in')
    .sort((a, b) => b.numericToken - a.numericToken)[0] || null;

  // Step 5: Determine the starting point for finding the next slot
  let searchStartIndex: number;

  if (lastWalkIn && lastWalkIn.slotIndex !== undefined) {
    // If there's a previous walk-in, start searching from after that slot + allotment.
    searchStartIndex = lastWalkIn.slotIndex + walkInTokenAllotment;
  } else {
    // This is the first walk-in. Start from the current time's slot.
    searchStartIndex = findCurrentSlotIndex(allSlots, now) + walkInTokenAllotment;
  }

  // Step 6: Find the next available slot by skipping occupied ones
  let finalWalkInSlotIndex = -1;
  let tempIndex = searchStartIndex;
  
  while(tempIndex < allSlots.length * 2) { // Loop beyond allSlots to handle extension
      if (!occupiedSlotIndexes.has(tempIndex)) {
          finalWalkInSlotIndex = tempIndex;
          break;
      }
      tempIndex++;
  }
  
  if (finalWalkInSlotIndex === -1) {
      throw new Error('Could not determine an available walk-in slot. The schedule may be too full.');
  }

  // Step 7: Calculate the estimated time for the found slot
  let estimatedTime;
  if (finalWalkInSlotIndex < allSlots.length) {
    estimatedTime = allSlots[finalWalkInSlotIndex];
  } else {
    // Handle extension beyond defined slots
    const lastSlotTime = allSlots[allSlots.length - 1];
    const slotsToAdd = finalWalkInSlotIndex - (allSlots.length - 1);
    estimatedTime = addMinutes(lastSlotTime, slotsToAdd * slotDuration);
  }

  // Step 8: Generate new numeric token
  const newNumericToken =
    appointments.length > 0 ? Math.max(...appointments.map(a => a.numericToken)) + 1 : 1;

  // Step 9: Calculate queue position
  const patientsAhead = appointments.filter(a => (a.slotIndex ?? -1) < finalWalkInSlotIndex).length;

  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: finalWalkInSlotIndex,
  };
}

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

function findCurrentSlotIndex(slots: Date[], now: Date): number {
  for (let i = 0; i < slots.length; i++) {
    if (isAfter(slots[i], now) || slots[i].getTime() === now.getTime()) {
      return i;
    }
  }
  return slots.length - 1; // If all slots have passed, return the last one
}
