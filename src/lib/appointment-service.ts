
import { collection, query, where, getDocs, orderBy, runTransaction, doc, increment, serverTimestamp, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  format,
  parse,
  addMinutes,
  subMinutes,
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
 * Uses an atomic counter document to ensure thread-safe token generation, preventing
 * race conditions when multiple users book concurrently.
 * Returns sequential token numbers (A001, A002, W003, etc.) shared across both token types.
 */
export async function generateNextToken(
  clinicId: string,
  doctorName: string,
  date: Date,
  type: 'A' | 'W'
): Promise<string> {
  const dateStr = format(date, "d MMMM yyyy");
  const counterDocId = `${clinicId}_${doctorName}_${dateStr}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const counterRef = doc(db, 'token-counters', counterDocId);
  
  // Use transaction with atomic increment to ensure concurrent requests get unique sequential numbers
  return await runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    
    let nextTokenNum: number;
    
    if (counterDoc.exists()) {
      // Counter exists, increment atomically
      const currentCount = counterDoc.data().count || 0;
      transaction.update(counterRef, {
        count: increment(1),
        lastUpdated: serverTimestamp()
      });
      nextTokenNum = currentCount + 1;
    } else {
      // Counter doesn't exist, initialize it and check existing appointments
      // This handles the migration case where counters don't exist yet
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
      
      const maxExistingToken = tokenNumbers.length > 0 ? Math.max(...tokenNumbers) : 0;
      nextTokenNum = maxExistingToken + 1;
      
      // Create counter starting from next number
      transaction.set(counterRef, {
        count: nextTokenNum,
        clinicId,
        doctorName,
        date: dateStr,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp()
      });
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
  const counterDocId = `${clinicId}_${doctorName}_${dateStr}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const counterRef = doc(db, 'token-counters', counterDocId);
  
  // Step 0: For A and W tokens, check if the slot is already taken (read before transaction)
  if (type === 'A' || type === 'W') {
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
    
    // Check if slot is already occupied (both A and W tokens now block slots)
    const slotConflict = slotSnapshot.docs.some(doc => {
      const data = doc.data();
      // Both A and W tokens block the slot (exclusive slots)
      return data.tokenNumber?.startsWith('A') || data.tokenNumber?.startsWith('W');
    });
    
    if (slotConflict) {
      const error = new Error('SLOT_ALREADY_BOOKED') as Error & { code?: string };
      error.code = 'SLOT_OCCUPIED';
      throw error;
    }
  }

  // Step 0.5: For W tokens, fetch appointments that need to be shifted (read before transaction)
  let appointmentsToShift: Array<{ id: string; slotIndex: number }> = [];
  if (type === 'W' && typeof appointmentData.slotIndex === 'number') {
    const appointmentsRef = collection(db, 'appointments');
    const subsequentQuery = query(
      appointmentsRef,
      where('clinicId', '==', clinicId),
      where('doctor', '==', doctorName),
      where('date', '==', dateStr),
      where('status', 'in', ['Pending', 'Confirmed'])
    );
    
    const subsequentSnapshot = await getDocs(subsequentQuery);
    
    // Find all appointments with slotIndex >= targetSlotIndex
    const targetSlotIndex = appointmentData.slotIndex;
    appointmentsToShift = subsequentSnapshot.docs
      .filter(doc => {
        const data = doc.data();
        const slotIdx = data.slotIndex;
        return slotIdx !== undefined && slotIdx >= targetSlotIndex;
      })
      .map(doc => ({
        id: doc.id,
        slotIndex: doc.data().slotIndex ?? 0
      }));
  }

  // Step 0.6: Check if counter exists and fetch existing appointments if needed (read before transaction)
  const counterDocSnapshot = await getDoc(counterRef);
  let initialNextTokenNum: number | null = null;
  let needsCounterInitialization = false;
  
  if (!counterDocSnapshot.exists()) {
    // Counter doesn't exist, fetch existing appointments to calculate next token
    needsCounterInitialization = true;
    const appointmentsRef = collection(db, 'appointments');
    const appointmentsQuery = query(
      appointmentsRef,
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
    
    const maxExistingToken = tokenNumbers.length > 0 ? Math.max(...tokenNumbers) : 0;
    initialNextTokenNum = maxExistingToken + 1;
  }

  return await runTransaction(db, async (transaction) => {
    // Step 1: Read all documents first (all reads before writes)
    
    // Read counter document
    const counterDoc = await transaction.get(counterRef);
    
    // For W tokens, read all appointments that need to be shifted
    const appointmentDocsToShift: Array<{ ref: any; data: any }> = [];
    if (type === 'W' && appointmentsToShift.length > 0) {
      for (const appointmentToShift of appointmentsToShift) {
        const appointmentRef = doc(db, 'appointments', appointmentToShift.id);
        const appointmentDoc = await transaction.get(appointmentRef);
        if (appointmentDoc.exists()) {
          appointmentDocsToShift.push({
            ref: appointmentRef,
            data: appointmentDoc.data()
          });
        }
      }
    }
    
    // Step 2: Now do all writes (after all reads)
    
    // For W tokens, shift subsequent appointments by +1
    if (type === 'W' && appointmentDocsToShift.length > 0) {
      for (const { ref, data } of appointmentDocsToShift) {
        const currentSlotIndex = data.slotIndex ?? 0;
        transaction.update(ref, {
          slotIndex: currentSlotIndex + 1,
          updatedAt: serverTimestamp()
        });
      }
    }
    
    // Step 3: Generate next sequential token using atomic counter
    
    let nextTokenNum: number;
    
    if (counterDoc.exists()) {
      // Counter exists, increment atomically
      const currentCount = counterDoc.data().count || 0;
      transaction.update(counterRef, {
        count: increment(1),
        lastUpdated: serverTimestamp()
      });
      nextTokenNum = currentCount + 1;
    } else {
      // Counter doesn't exist, use pre-calculated value from before transaction
      if (needsCounterInitialization && initialNextTokenNum !== null) {
        nextTokenNum = initialNextTokenNum;
        // Create counter starting from next number
        transaction.set(counterRef, {
          count: nextTokenNum,
          clinicId,
          doctorName,
          date: dateStr,
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      } else {
        // Fallback: if somehow we didn't pre-fetch, start from 1
        nextTokenNum = 1;
        transaction.set(counterRef, {
          count: nextTokenNum,
          clinicId,
          doctorName,
          date: dateStr,
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      }
    }
    
    // For A tokens, use slotIndex + 1 for both tokenNumber and numericToken
    // For W tokens, use the counter-based nextTokenNum
    let tokenNumber: string;
    let numericToken: number;
    
    if (type === 'A' && typeof appointmentData.slotIndex === 'number') {
      const tokenNum = appointmentData.slotIndex + 1;
      tokenNumber = `${type}${String(tokenNum).padStart(3, '0')}`;
      numericToken = tokenNum;
    } else {
      tokenNumber = `${type}${String(nextTokenNum).padStart(3, '0')}`;
      numericToken = (typeof appointmentData.slotIndex === 'number') ? (appointmentData.slotIndex + 1) : nextTokenNum;
    }
    
    return { tokenNumber, numericToken };
  });
}


/**
 * Helper function to check if a slot is vacant and available for walk-in placement
 */
function isSlotVacant(
  slotTime: Date,
  currentTime: Date,
  appointment: Appointment | null
): boolean {
  // Rule 1: Slot must be in the future
  if (isBefore(slotTime, currentTime)) {
    return false;
  }

  // Rule 2: No appointment = vacant
  if (!appointment) {
    return true;
  }

  // Rule 3: Check appointment status
  const vacantStatuses = ['Skipped', 'Completed', 'No-show', 'Cancelled'];
  if (vacantStatuses.includes(appointment.status)) {
    return true;
  }

  // Rule 4: Active appointments (Pending/Confirmed) = Reserved
  return false;
}

/**
 * Helper function to find next immediate slot (first slot where slotTime >= currentTime)
 */
function findNextImmediateSlot(
  allSlots: { time: Date; sessionIndex: number }[],
  currentTime: Date
): number {
  for (let i = 0; i < allSlots.length; i++) {
    if (isAfter(allSlots[i].time, currentTime) || allSlots[i].time.getTime() === currentTime.getTime()) {
      return i;
    }
  }
  // If all slots are in the past, return length (next slot would be after the last)
  return allSlots.length;
}

/**
 * Calculates walk-in token details including estimated time and queue position
 *
 * New Logic:
 * - walkInTokenAllotment defines how many SLOTS to skip (default 5)
 * - Reference point: Previous W token OR next immediate slot OR slotIndex 0 (before start)
 * - Count walkInTokenAllotment slots from reference → Place at 6th position
 * - Check for vacant slots before calculated position → Use earliest vacant if found
 * - Transition: If calculated position > last A token → Place consecutively (last A + 1)
 *
 * Features:
 * ✅ Walk-in available any time (no opening restriction).
 * ✅ Walk-in closes 15 min before consultation end.
 * ✅ Vacancy filling before calculated position.
 * ✅ Transition to consecutive slots after last A token.
 */
export async function calculateWalkInDetails(
  doctor: Doctor,
  walkInTokenAllotment: number = 5
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

  // Walk-ins are only available for the same day (today)
  // This function should only be called for today's date

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
  
  // Walk-in opens 2 hours before the first session starts
  const walkInOpenTime = subMinutes(availabilityStart, 120); // 120 minutes = 2 hours
  
  // Walk-in closes 15 minutes before consultation end
  const walkInCloseTime = addMinutes(availabilityEnd, -15);

  if (isBefore(now, walkInOpenTime)) {
    const openTimeFormatted = format(walkInOpenTime, 'hh:mm a');
    throw new Error(`Walk-in registration opens at ${openTimeFormatted} (2 hours before the first session).`);
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

  // Find the last advanced appointment slot
  const lastAdvancedSlotIndex = advancedAppointments.length > 0
    ? Math.max(...advancedAppointments.map(a => a.slotIndex ?? -1))
    : -1;

  // Step 4: Determine reference point
  let referenceSlotIndex: number;
  let previousW: Appointment | null = null;

  // Find future W tokens (slots that haven't passed yet)
  // Exclude skipped W tokens from being used as reference
  const futureWalkIns = walkInAppointments.filter(w => {
    const wSlotIndex = w.slotIndex ?? -1;
    if (wSlotIndex < 0 || wSlotIndex >= allSlots.length) return false;
    const wSlot = allSlots[wSlotIndex];
    return wSlot && 
           w.status !== 'Skipped' && // Exclude skipped W tokens from reference
           (isAfter(wSlot.time, now) || wSlot.time.getTime() === now.getTime());
  });

  if (futureWalkIns.length > 0) {
    // Use latest future W token as reference
    previousW = futureWalkIns.sort((a, b) => (b.slotIndex ?? 0) - (a.slotIndex ?? 0))[0];
    referenceSlotIndex = previousW.slotIndex ?? 0;
  } else {
    // No upcoming W tokens - use standard reference point
    if (isBefore(now, availabilityStart)) {
      // Before availability starts: use slotIndex 0
      referenceSlotIndex = 0;
    } else {
      // After availability starts: use next immediate slot
      referenceSlotIndex = findNextImmediateSlot(allSlots, now);
      if (referenceSlotIndex >= allSlots.length) {
        // All slots are in the past
        throw new Error('No available slots for walk-in today.');
      }
    }
  }

  // Step 5: Calculate target position (6th slot from reference)
  const targetSlotIndex = referenceSlotIndex + walkInTokenAllotment;

  // Step 6: Check for vacant slots before target position
  const vacancyCheckStart = referenceSlotIndex;
  const vacancyCheckEnd = Math.min(targetSlotIndex - 1, allSlots.length - 1);

  // Find earliest vacant slot in range
  let earliestVacancy: { index: number; slot: { time: Date; sessionIndex: number } } | null = null;

  for (let i = vacancyCheckStart; i <= vacancyCheckEnd; i++) {
    const slot = allSlots[i];
    // Skip if this is the previous W's slot
    if (previousW && i === previousW.slotIndex) {
      continue;
    }

    // Find appointment at this slot
    const appointment = appointments.find(apt => apt.slotIndex === i) || null;

    // Check if slot is vacant
    if (isSlotVacant(slot.time, now, appointment)) {
      if (!earliestVacancy || i < earliestVacancy.index) {
        earliestVacancy = { index: i, slot };
      }
    }
  }

  // Step 7: Determine final placement
  let finalSlotIndex: number;
  
  if (earliestVacancy) {
    // Use earliest vacant slot
    finalSlotIndex = earliestVacancy.index;
  } else {
    // No vacancy found, use calculated target position
    finalSlotIndex = targetSlotIndex;
  }

  // Step 8: Transition Logic - Check if calculated position is after last A token
  // If yes, place consecutively (last A + 1). If no, maintain spacing (use calculated position)
  if (lastAdvancedSlotIndex >= 0 && finalSlotIndex > lastAdvancedSlotIndex) {
    // Calculated position is after last A token → place consecutively
    finalSlotIndex = lastAdvancedSlotIndex + 1;
  }

  // Step 9: Validate slot is within bounds
  if (finalSlotIndex >= allSlots.length) {
    throw new Error('No available slots for walk-in today.');
  }
  
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

  // Step 10: Get the actual slot time for placement
  const actualSlotTime = allSlots[finalSlotIndex].time;
  
  // Step 11: Get session index from final slot
  finalSessionIndex = allSlots[finalSlotIndex].sessionIndex;

  // Step 12: Check if walk-in time goes beyond consultation hours
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

  // Step 13: Generate numeric token (sequential across all appointments)
  // numeric token should align with slot order across sessions -> slotIndex + 1
  const newNumericToken = finalSlotIndex + 1;

  return {
    estimatedTime, // For display purposes
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: finalSlotIndex,
    sessionIndex: finalSessionIndex,
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

/**
 * Calculates slot details for a skipped token to rejoin the queue
 * 
 * Logic:
 * - Uses slotIndex-based placement (consistent with walk-in logic)
 * - Places token after N active patients (N = skippedTokenRecurrence)
 * - Updates both slotIndex and time field to keep in sync
 * - Shows error if target slot is conflicted (no auto-resolve)
 * 
 * @param skippedAppointment - The skipped appointment that needs to rejoin
 * @param activeAppointments - Active appointments (Pending/Confirmed) for same doctor and date, sorted by slotIndex
 * @param doctor - Doctor details
 * @param recurrence - Number of patients to skip ahead (from clinicDetails.skippedTokenRecurrence)
 * @param date - The appointment date
 * @returns Object with slotIndex, time, sessionIndex, or throws error on conflict
 */
export async function calculateSkippedTokenRejoinSlot(
  skippedAppointment: Appointment,
  activeAppointments: Appointment[],
  doctor: Doctor,
  recurrence: number,
  date: Date
): Promise<{
  slotIndex: number;
  time: string;
  sessionIndex: number;
}> {
  const dateStr = format(date, 'd MMMM yyyy');
  const dayOfWeek = format(date, 'EEEE');
  const slotDuration = doctor.averageConsultingTime || 15;

  // Step 1: Get doctor's availability for the day
  const todaysAvailability = doctor.availabilitySlots?.find(s => s.day === dayOfWeek);
  if (!todaysAvailability || !todaysAvailability.timeSlots?.length) {
    throw new Error('Doctor not available on this date');
  }

  // Step 2: Generate all time slots for the day
  const allSlots = generateTimeSlotsWithSession(todaysAvailability.timeSlots, date, slotDuration);
  if (allSlots.length === 0) {
    throw new Error('No consultation slots available for this date');
  }

  // Step 3: Get active appointments sorted by slotIndex
  const activeBySlotIndex = activeAppointments
    .filter(a => a.doctor === skippedAppointment.doctor && a.date === dateStr)
    .filter(a => (a.status === 'Pending' || a.status === 'Confirmed'))
    .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));

  // Step 4: Find next immediate slot as reference
  const now = new Date();
  const nextImmediateSlotIndex = findNextImmediateSlot(allSlots, now);
  
  if (nextImmediateSlotIndex >= allSlots.length) {
    // All slots are in the past
    const lastSlot = allSlots[allSlots.length - 1];
    return {
      slotIndex: allSlots.length - 1,
      time: format(lastSlot.time, 'hh:mm a'),
      sessionIndex: lastSlot.sessionIndex,
    };
  }

  // Step 5: Calculate target slotIndex based on recurrence
  // Reference: next immediate slot
  // Place at: reference + recurrence
  const targetSlotIndex = nextImmediateSlotIndex + recurrence;

  // Step 6: Validate slot availability
  // Check if target slot is within available slots
  if (targetSlotIndex >= allSlots.length) {
    // Beyond scheduled hours - use last slot
    const lastSlot = allSlots[allSlots.length - 1];
    return {
      slotIndex: allSlots.length - 1,
      time: format(lastSlot.time, 'hh:mm a'),
      sessionIndex: lastSlot.sessionIndex,
    };
  }

  // Step 7: Check for slot conflict (occupied by any active appointment - A or W token)
  // We already have activeAppointments passed in, but we need to check ALL active appointments (including W tokens)
  // The activeAppointments parameter might only include A tokens, so we use it plus check for any other conflicts
  // Check if target slot is occupied by any appointment in the activeAppointments list
  const isOccupiedByActive = activeBySlotIndex.some(apt => 
    apt.slotIndex === targetSlotIndex
  );

  // Also check all appointments for the day to catch W tokens that might not be in activeAppointments
  const appointmentsRef = collection(db, 'appointments');
  const allActiveQuery = query(
    appointmentsRef,
    where('doctor', '==', skippedAppointment.doctor),
    where('date', '==', dateStr),
    where('slotIndex', '==', targetSlotIndex),
    where('status', 'in', ['Pending', 'Confirmed'])
  );
  const allActiveSnapshot = await getDocs(allActiveQuery);
  const slotOccupied = allActiveSnapshot.docs.some(doc => {
    const apt = doc.data() as Appointment;
    return apt.id !== skippedAppointment.id; // Exclude the skipped appointment itself
  });

  const isOccupied = isOccupiedByActive || slotOccupied;

  if (isOccupied) {
    throw new Error(`Slot ${targetSlotIndex} is already occupied. Cannot rejoin at this position.`);
  }

  // Step 8: Get slot time and session index
  const targetSlot = allSlots[targetSlotIndex];
  if (!targetSlot) {
    throw new Error(`Invalid slot index: ${targetSlotIndex}`);
  }

  return {
    slotIndex: targetSlotIndex,
    time: format(targetSlot.time, 'hh:mm a'),
    sessionIndex: targetSlot.sessionIndex,
  };
}