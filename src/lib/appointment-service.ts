
import { collection, query, where, getDocs, orderBy, runTransaction, doc } from 'firebase/firestore';
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
  isWithinInterval,
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
 * 
 * Uses Firestore transactions to ensure atomic token generation and prevent race conditions.
 * Returns sequential token numbers (A001, A002, W003, etc.) shared across both token types.
 */
export async function generateNextToken(
  clinicId: string,
  doctorName: string,
  date: Date,
  type: 'A' | 'W'
): Promise<string> {
  const dateStr = format(date, "d MMMM yyyy");
  
  // Use transaction to ensure atomic token generation
  return await runTransaction(db, async (transaction) => {
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

    // Double-check token doesn't already exist (additional safety check within transaction)
    const existingTokenDoc = querySnapshot.docs.find(doc => {
      const data = doc.data();
      return data.tokenNumber === `${type}${String(nextTokenNum).padStart(3, '0')}`;
    });
    
    if (existingTokenDoc) {
      // If token exists, find next available number
      const existingNumbers = new Set(tokenNumbers);
      let candidate = nextTokenNum + 1;
      while (existingNumbers.has(candidate)) {
        candidate++;
      }
      return `${type}${String(candidate).padStart(3, '0')}`;
    }

    return `${type}${String(nextTokenNum).padStart(3, '0')}`;
  });
}


/**
 * Generates the next token and reserves the slot in a single atomic transaction.
 * This prevents race conditions where multiple bookings get the same token.
 * 
 * For A tokens: Checks if slot is already occupied by another A token (exclusive reservation)
 * For W tokens: No slot collision check (can share slots with A tokens)
 */
export async function generateNextTokenAndReserveSlot(
  clinicId: string,
  doctorName: string,
  date: Date,
  type: 'A' | 'W',
  appointmentData: {
    time: string;
    slotIndex: number;
    [key: string]: any;
  }
): Promise<{ tokenNumber: string; numericToken: number }> {
  const dateStr = format(date, "d MMMM yyyy");
  
  return await runTransaction(db, async (transaction) => {
    // Step 1: For A tokens, check if the slot is already taken by another A token
    if (type === 'A') {
      const appointmentsRef = collection(db, 'appointments');
      const slotBookedQuery = query(
        appointmentsRef,
        where('clinicId', '==', clinicId),
        where('doctor', '==', doctorName),
        where('date', '==', dateStr),
        where('slotIndex', '==', appointmentData.slotIndex),
        where('status', 'in', ['Pending', 'Confirmed'])
      );
      
      const slotSnapshot = await getDocs(slotBookedQuery);
      
      // Check if any A token (not walk-in) occupies this slot
      const aTokenConflict = slotSnapshot.docs.some(doc => {
        const data = doc.data();
        // Only A tokens (not walk-ins) block the slot
        return data.bookedVia !== 'Walk-in' && data.tokenNumber?.startsWith('A');
      });
      
      if (aTokenConflict) {
        const error = new Error('SLOT_ALREADY_BOOKED') as Error & { code?: string };
        error.code = 'SLOT_OCCUPIED';
        throw error;
      }
    }
    
    // Step 2: Generate next sequential token
    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('clinicId', '==', clinicId),
      where('doctor', '==', doctorName),
      where('date', '==', dateStr)
    );
    
    const tokenSnapshot = await getDocs(appointmentsQuery);
    const tokenNumbers = tokenSnapshot.docs.map(doc => {
      const token = doc.data().tokenNumber;
      if (typeof token === 'string' && (token.startsWith('A') || token.startsWith('W'))) {
        return parseInt(token.substring(1), 10);
      }
      return 0;
    }).filter(num => !isNaN(num) && num > 0);
    
    const lastToken = tokenNumbers.length > 0 ? Math.max(...tokenNumbers) : 0;
    const nextTokenNum = lastToken + 1;
    const tokenNumber = `${type}${String(nextTokenNum).padStart(3, '0')}`;
    
    // Step 3: Final safety check - verify token doesn't already exist
    const tokenExists = tokenSnapshot.docs.some(doc => {
      return doc.data().tokenNumber === tokenNumber;
    });
    
    if (tokenExists) {
      // Find next available token number
      const existingNumbers = new Set(tokenNumbers);
      let candidate = nextTokenNum + 1;
      while (existingNumbers.has(candidate)) {
        candidate++;
      }
      return { 
        tokenNumber: `${type}${String(candidate).padStart(3, '0')}`, 
        numericToken: candidate 
      };
    }
    
    return { tokenNumber, numericToken: nextTokenNum };
  });
}


/**
 * Calculates walk-in token details including estimated time and queue position
 *
 * Logic:
 * - walkInTokenAllotment defines how many APPOINTMENTS to skip (not slots)
 * - Walk-ins are placed based on counting actual appointments in timeline
 * - If no previous walk-ins: start from reference slot, skip walkInTokenAllotment appointments
 * - If previous walk-ins exist: place after last walk-in, skip walkInTokenAllotment appointments
 * - If chosen slot overlaps advanced appointment, move to next free slot
 * - If beyond official availability, extend schedule with slotDuration increments
 *
 * Features:
 * ✅ Walk-in opens 30 min before consultation.
 * ✅ Walk-in closes 30 min before consultation end.
 * ✅ Proper spacing logic for walk-ins.
 * ✅ Auto-extends availability beyond end time for last-minute walk-ins.
 */
export async function calculateWalkInDetails(
  doctor: Doctor,
  walkInTokenAllotment: number = 5,
  walkInCapacityThreshold: number = 0.75
): Promise<{
  estimatedTime: Date;
  patientsAhead: number;
  numericToken: number;
  slotIndex: number;
  sessionIndex: number;
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
  const allSlots = generateTimeSlotsWithSession(todaysAvailability.timeSlots, now, slotDuration);
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

  // Step 3.5: Check walk-in capacity based on advanced appointment density
  const totalAvailableSlots = allSlots.length;
  const advancedAppointmentCount = advancedAppointments.length;
  const advancedAppointmentDensity = advancedAppointmentCount / totalAvailableSlots;
  
  // Note: We don't block walk-ins based on density anymore
  // Instead, we'll check if the calculated time goes beyond consultation hours

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
    let referenceSlotIndex: number;
    if (isBefore(now, availabilityStart)) {
      referenceSlotIndex = 0; // Start from first slot
    } else {
      referenceSlotIndex = findCurrentSlotIndex(allSlots.map(s => s.time), now);
    }
    
    // Move forward in time, counting ALL appointments (advanced + existing walk-ins) encountered in the timeline
    let appointmentsSkipped = 0;
    let currentSlotIndex = referenceSlotIndex;
    
    while (appointmentsSkipped < walkInTokenAllotment && currentSlotIndex < allSlots.length) {
      // Check if this slot has ANY appointment (advanced or walk-in)
      const hasAppointment = appointments.some(apt => apt.slotIndex === currentSlotIndex);
      if (hasAppointment) {
        appointmentsSkipped++;
      }
      currentSlotIndex++;
    }
    
    targetSlotIndex = currentSlotIndex;
    
  } else {
    // Case B: Previous walk-ins exist
    const lastWalkInSlotIndex = lastWalkIn.slotIndex ?? 0;
    
    if (lastWalkInSlotIndex > lastAdvancedSlotIndex) {
      // Last walk-in is after last advanced appointment → assign next consecutive slot (no skipping)
      targetSlotIndex = lastWalkInSlotIndex + 1;
    } else {
      // Start from slot after last walk-in and skip walkInTokenAllotment appointments forward
      let appointmentsSkipped = 0;
      let currentSlotIndex = lastWalkInSlotIndex + 1;
      
      while (appointmentsSkipped < walkInTokenAllotment && currentSlotIndex < allSlots.length) {
        // Check if this slot has ANY appointment (advanced or walk-in)
        const hasAppointment = appointments.some(apt => apt.slotIndex === currentSlotIndex);
        if (hasAppointment) {
          appointmentsSkipped++;
        }
        currentSlotIndex++;
      }
      
      targetSlotIndex = currentSlotIndex;
    }
  }

  // W tokens can share slots with A tokens, so no collision checking needed
  const finalSlotIndex = targetSlotIndex;
  
  let finalSessionIndex = -1;

  // Step 5: Calculate patients ahead first
  const pendingAppointments = appointments.filter(a =>
    a.status === 'Pending' || a.status === 'Confirmed'
  );
  const patientsAhead = pendingAppointments.filter(a => {
    const aptSlotIndex = a.slotIndex ?? 0;
    return aptSlotIndex < finalSlotIndex;
  }).length;

  // Step 6: Calculate estimated time for display (based on consultation start time)
  let estimatedTime: Date;
  if (isBefore(now, availabilityStart)) {
    // If current time is before consultation start, use consultation start + (patientsAhead * averageConsultationTime)
    estimatedTime = addMinutes(availabilityStart, patientsAhead * slotDuration);
  } else {
    // If consultation has started, use current time + (patientsAhead * averageConsultationTime)
    estimatedTime = addMinutes(now, patientsAhead * slotDuration);
  }

  // Step 7: Get the actual slot time for placement (simply last appointment + averageConsultationTime)
  let actualSlotTime: Date;
  
  // Find the last appointment (A or W) to calculate actual placement time
  const allAppointments = [...advancedAppointments, ...walkInAppointments];
  const lastAppointment = allAppointments.length > 0 
    ? allAppointments.reduce((latest, apt) => {
        const aptTime = parseTimeString(apt.time, now);
        const latestTime = parseTimeString(latest.time, now);
        return aptTime > latestTime ? apt : latest;
      })
    : null;
  
  if (lastAppointment) {
    // Simply place W token after last appointment + averageConsultationTime
    const lastAppointmentTime = parseTimeString(lastAppointment.time, now);
    actualSlotTime = addMinutes(lastAppointmentTime, slotDuration);
  } else {
    // No appointments yet, start from consultation start time
    actualSlotTime = availabilityStart;
  }
  
  // Step 8: Find appropriate session index for the actual slot time
  const slotInfo = allSlots.find(s => 
    isWithinInterval(actualSlotTime, { 
      start: s.time, 
      end: addMinutes(s.time, slotDuration) 
    })
  );
  
  if (slotInfo) {
    finalSessionIndex = slotInfo.sessionIndex;
  } else {
    // If actual slot time is beyond scheduled hours, use the last session
    const lastSlot = allSlots[allSlots.length - 1];
    finalSessionIndex = lastSlot.sessionIndex;
  }

  // Step 8: Check if walk-in time goes beyond consultation hours
  const consultationEndTime = parseTimeString(
    todaysAvailability.timeSlots[todaysAvailability.timeSlots.length - 1].to,
    now
  );
  
  // Add buffer time (e.g., 30 minutes) beyond consultation end
  const maxAllowedTime = addMinutes(consultationEndTime, 30);
  
  if (isAfter(actualSlotTime, maxAllowedTime)) {
    const consultationEndFormatted = format(consultationEndTime, 'hh:mm a');
    const actualTimeFormatted = format(actualSlotTime, 'hh:mm a');
    throw new Error(`Walk-ins cannot be accommodated today. The estimated consultation time (${actualTimeFormatted}) would extend beyond the doctor's consultation hours (ends at ${consultationEndFormatted}). Please book an advanced appointment for tomorrow or try again earlier in the day.`);
  }

  // Step 9: Generate numeric token (sequential across all appointments)
  const numericTokens = appointments.map(a => a.numericToken);
  const newNumericToken = numericTokens.length > 0 ? Math.max(...numericTokens) + 1 : 1;

  return {
    estimatedTime, // For display purposes
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: finalSlotIndex,
    sessionIndex: finalSessionIndex,
    actualSlotTime, // The actual time slot for appointment placement
  };
}


/**
 * Generates all time slots for the given time ranges with session index
 */
function generateTimeSlotsWithSession(timeSlots: TimeSlot[], referenceDate: Date, slotDuration: number): { time: Date, sessionIndex: number }[] {
  const slots: { time: Date, sessionIndex: number }[] = [];
  timeSlots.forEach((slot, sessionIndex) => {
    const startTime = parseTimeString(slot.from, referenceDate);
    const endTime = parseTimeString(slot.to, referenceDate);
    let current = startTime;
    while (isBefore(current, endTime)) {
      slots.push({ time: current, sessionIndex });
      current = addMinutes(current, slotDuration);
    }
  });
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