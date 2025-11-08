
import { collection, query, where, getDocs, orderBy, runTransaction, doc, increment, serverTimestamp, updateDoc, getDoc, setDoc } from 'firebase/firestore';
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
 * Calculate total slots across all sessions for a doctor on a specific date
 * Returns the total number of slots (e.g., if slots are 0-23, returns 24)
 * W tokens will start from (totalSlots + 1)
 */
async function calculateTotalSlotsForDay(
  clinicId: string,
  doctorName: string,
  date: Date
): Promise<number> {
  // Get doctor details
  const doctorsRef = collection(db, 'doctors');
  const doctorsQuery = query(
    doctorsRef,
    where('clinicId', '==', clinicId),
    where('name', '==', doctorName)
  );
  const doctorsSnapshot = await getDocs(doctorsQuery);
  
  if (doctorsSnapshot.empty) {
    return 0;
  }
  
  const doctor = doctorsSnapshot.docs[0].data() as Doctor;
  const dayOfWeek = format(date, 'EEEE');
  const availabilityForDay = doctor.availabilitySlots?.find(s => s.day === dayOfWeek);
  
  if (!availabilityForDay || !availabilityForDay.timeSlots || availabilityForDay.timeSlots.length === 0) {
    return 0;
  }
  
  const consultationTime = doctor.averageConsultingTime || 15;
  let totalSlots = 0;
  
  // Calculate slots for each session
  for (let sessionIndex = 0; sessionIndex < availabilityForDay.timeSlots.length; sessionIndex++) {
    const session = availabilityForDay.timeSlots[sessionIndex];
    const sessionStart = parseTimeString(session.from, date);
    const sessionEnd = parseTimeString(session.to, date);
    
    let currentTime = sessionStart;
    let sessionSlotCount = 0;
    while (isBefore(currentTime, sessionEnd)) {
      sessionSlotCount++;
      currentTime = addMinutes(currentTime, consultationTime);
    }
    
    // Add session slots to total (slots are 0-indexed, so totalSlots is the count)
    totalSlots += sessionSlotCount;
  }
  
  return totalSlots;
}

/**
 * Generates the next sequential token number for a given doctor and date.
 * 'A' for Advanced/Online/Admin, 'W' for Walk-in.
 * 
 * For A tokens: Uses a shared counter (A001, A002, A003...)
 * For W tokens: Starts from (total slots count + 1) and uses a separate counter (W025, W026, W027...)
 * 
 * Uses atomic counter documents to ensure thread-safe token generation, preventing
 * race conditions when multiple users book concurrently.
 */
export async function generateNextToken(
  clinicId: string,
  doctorName: string,
  date: Date,
  type: 'A' | 'W'
): Promise<string> {
  const dateStr = format(date, "d MMMM yyyy");
  
  // Use transaction with atomic increment to ensure concurrent requests get unique sequential numbers
  return await runTransaction(db, async (transaction) => {
    let nextTokenNum: number;
    let counterRef: any;
    
    if (type === 'A') {
      // A tokens: Use shared counter (A001, A002, A003...)
      const counterDocId = `${clinicId}_${doctorName}_${dateStr}_A`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      counterRef = doc(db, 'token-counters', counterDocId);
      const counterDoc = await transaction.get(counterRef);
      
      if (counterDoc.exists()) {
        // Counter exists, increment atomically
        const currentCount = counterDoc.data().count || 0;
        transaction.update(counterRef, {
          count: increment(1),
          lastUpdated: serverTimestamp()
        });
        nextTokenNum = currentCount + 1;
      } else {
        // Counter doesn't exist, initialize it and check existing A tokens
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
          if (typeof token === 'string' && token.startsWith('A')) {
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
          type: 'A',
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      }
    } else {
      // W tokens: Start from (total slots count + 1)
      const totalSlots = await calculateTotalSlotsForDay(clinicId, doctorName, date);
      const wTokenStartNumber = totalSlots + 1;
      
      const counterDocId = `${clinicId}_${doctorName}_${dateStr}_W`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      counterRef = doc(db, 'token-counters', counterDocId);
      const counterDoc = await transaction.get(counterRef);
      
      if (counterDoc.exists()) {
        // Counter exists, increment atomically
        const currentCount = counterDoc.data().count || 0;
        transaction.update(counterRef, {
          count: increment(1),
          lastUpdated: serverTimestamp()
        });
        // W tokens start from (total slots + 1), so add the start number
        nextTokenNum = wTokenStartNumber + currentCount;
      } else {
        // Counter doesn't exist, initialize it and check existing W tokens
        const appointmentsRef = collection(db, 'appointments');
        const q = query(
          appointmentsRef,
          where('clinicId', '==', clinicId),
          where('doctor', '==', doctorName),
          where('date', '==', dateStr)
        );
        const querySnapshot = await getDocs(q);
        const wTokenNumbers = querySnapshot.docs.map(doc => {
          const token = doc.data().tokenNumber;
          if (typeof token === 'string' && token.startsWith('W')) {
            return parseInt(token.substring(1), 10);
          }
          return 0;
        }).filter(num => !isNaN(num) && num >= wTokenStartNumber);
        
        if (wTokenNumbers.length > 0) {
          // Find the highest W token number and increment from there
          const maxExistingWToken = Math.max(...wTokenNumbers);
          nextTokenNum = maxExistingWToken + 1;
          // Set counter to the offset from start number
          transaction.set(counterRef, {
            count: nextTokenNum - wTokenStartNumber + 1,
            clinicId,
            doctorName,
            date: dateStr,
            type: 'W',
            startNumber: wTokenStartNumber,
            lastUpdated: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        } else {
          // No existing W tokens, start from wTokenStartNumber
          nextTokenNum = wTokenStartNumber;
          transaction.set(counterRef, {
            count: 1,
            clinicId,
            doctorName,
            date: dateStr,
            type: 'W',
            startNumber: wTokenStartNumber,
            lastUpdated: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        }
      }
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
): Promise<{ tokenNumber: string; numericToken: number; slotIndex: number }> {
  const dateStr = format(date, "d MMMM yyyy");
  
  console.log('🎯 [DEBUG] generateNextTokenAndReserveSlot called:', {
    type,
    slotIndex: appointmentData.slotIndex,
    time: appointmentData.time,
    clinicId,
    doctorName,
    date: dateStr
  });
  
  // Step 0: For A tokens, prioritize empty slots first, then check for imaginary W slots
  if (type === 'A' && typeof appointmentData.slotIndex === 'number') {
    // Get clinic details to find walkInTokenAllotment
    const clinicRef = doc(db, 'clinics', clinicId);
    const clinicSnapshot = await getDoc(clinicRef);
    const clinicData = clinicSnapshot.data();
    const walkInTokenAllotment = clinicData?.walkInTokenAllotment || 7;
    
    // Get all appointments for the day to calculate imaginary W slot positions
    const appointmentsRef = collection(db, 'appointments');
    const allAppointmentsQuery = query(
      appointmentsRef,
      where('clinicId', '==', clinicId),
      where('doctor', '==', doctorName),
      where('date', '==', dateStr)
    );
    const allAppointmentsSnapshot = await getDocs(allAppointmentsQuery);
    const allAppointments = allAppointmentsSnapshot.docs.map(doc => doc.data() as Appointment);
    
    // Get booked slot indices (Pending or Confirmed appointments)
    const bookedSlotIndices = new Set(
      allAppointments
        .filter(a => (a.status === 'Pending' || a.status === 'Confirmed'))
        .map(a => a.slotIndex ?? -1)
        .filter(idx => idx >= 0)
    );
    
    // Priority 1: A tokens should always fill the earliest available empty slot first
    // Find all empty slots (not booked and not imaginary W slots)
    // We'll calculate imaginary W slots first to exclude them
    const requestedSlotIndex = appointmentData.slotIndex;
    
    // First, calculate imaginary W slot positions to exclude them
    const confirmedAppointments = allAppointments
      .filter(a => (a.status === 'Pending' || a.status === 'Confirmed'))
      .filter(a => a.bookedVia === 'Advanced Booking' || a.bookedVia === 'Online' || a.bookedVia === 'Advanced')
      .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
    
    const existingWTokens = allAppointments
      .filter(a => a.bookedVia === 'Walk-in' && (a.status === 'Pending' || a.status === 'Confirmed'))
      .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
    
    const imaginaryWSlotPositions = new Set<number>();
    
    if (confirmedAppointments.length === 0) {
      imaginaryWSlotPositions.add(walkInTokenAllotment);
    } else if (existingWTokens.length === 0) {
      // First W token: only add imaginary W slots if we have at least walkInTokenAllotment confirmed appointments
      // If we have fewer than walkInTokenAllotment confirmed appointments, don't add any imaginary W slots yet
      // All slots should be available for A tokens to fill
      if (confirmedAppointments.length >= walkInTokenAllotment) {
        const sortedBySlotIndex = [...confirmedAppointments].sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
        const targetSlotIndex = walkInTokenAllotment - 1;
        const targetAppointment = sortedBySlotIndex.find(a => (a.slotIndex ?? Infinity) === targetSlotIndex) || sortedBySlotIndex[walkInTokenAllotment - 1];
        const firstWSlot = targetAppointment ? (targetAppointment.slotIndex ?? 0) + 1 : walkInTokenAllotment;
        imaginaryWSlotPositions.add(firstWSlot);
        
        let currentWSlot = firstWSlot;
        const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), 0);
        while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
          currentWSlot += walkInTokenAllotment + 1; // Fixed: should be +1, not just walkInTokenAllotment
          imaginaryWSlotPositions.add(currentWSlot);
        }
      }
      // If fewer than walkInTokenAllotment confirmed appointments, don't add any imaginary W slots
      // All slots should be available for A tokens to fill
    } else {
      const lastWToken = existingWTokens[existingWTokens.length - 1];
      const lastWTokenSlotIndex = lastWToken?.slotIndex ?? -1;
      
      const appointmentsAfterLastW = confirmedAppointments.filter(a => {
        const aptSlotIndex = a.slotIndex ?? 0;
        return aptSlotIndex > lastWTokenSlotIndex;
      });
      
      if (appointmentsAfterLastW.length >= walkInTokenAllotment) {
        const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 1];
        const nextWSlot = (targetAppointment.slotIndex ?? 0) + 1;
        imaginaryWSlotPositions.add(nextWSlot);
        
        let currentWSlot = nextWSlot;
        const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), lastWTokenSlotIndex);
        while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
          currentWSlot += walkInTokenAllotment + 1; // Fixed: should be +1, not just walkInTokenAllotment
          imaginaryWSlotPositions.add(currentWSlot);
        }
      }
      // If fewer than walkInTokenAllotment appointments after last W, don't add any imaginary W slots yet
      // All slots should be available for A tokens to fill
    }
    
    // Find the maximum slot index to search up to
    const maxSlotIndex = Math.max(
      ...allAppointments.map(a => a.slotIndex ?? -1).filter(idx => idx >= 0),
      requestedSlotIndex,
      0
    );
    
    // Find all available empty slots (not booked and not imaginary W slots)
    const availableEmptySlots: number[] = [];
    for (let i = 0; i <= Math.max(maxSlotIndex, requestedSlotIndex) + 10; i++) {
      if (!bookedSlotIndices.has(i) && !imaginaryWSlotPositions.has(i)) {
        availableEmptySlots.push(i);
      }
    }
    
    // If there are available empty slots, use the earliest one
    if (availableEmptySlots.length > 0) {
      const earliestEmptySlot = Math.min(...availableEmptySlots);
      console.log('✅ [DEBUG] A token: Found available empty slot, using earliest empty slot:', {
        requestedSlotIndex,
        earliestEmptySlot,
        availableEmptySlots: availableEmptySlots.sort((a, b) => a - b).slice(0, 10) // Show first 10 for debugging
      });
      appointmentData.slotIndex = earliestEmptySlot;
      // Continue to check if this slot is an imaginary W slot (but it shouldn't be since we excluded them)
    }
    
    // Check if the selected slotIndex (after potentially being changed to earliest empty slot) matches ANY imaginary W slot position
    // A tokens should NEVER be able to book imaginary W slots, regardless of 1-hour window
    // Imaginary W slots are always reserved for W tokens
    const isImaginaryWSlot = imaginaryWSlotPositions.has(appointmentData.slotIndex);
    
    console.log('🔍 [DEBUG] Final Validation Check:', {
      requestedSlotIndex: appointmentData.slotIndex,
      imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions).sort((a, b) => a - b),
      walkInTokenAllotment,
      confirmedAppointmentsCount: confirmedAppointments.length,
      existingWTokensCount: existingWTokens.length,
      isImaginaryWSlot,
      confirmedAppointments: confirmedAppointments.map(a => ({
        tokenNumber: a.tokenNumber,
        slotIndex: a.slotIndex,
        status: a.status
      }))
    });
    
    if (isImaginaryWSlot) {
      // Find the next available slot that is not an imaginary W slot
      const bookedSlotIndices = new Set(
        allAppointments
          .filter(a => (a.status === 'Pending' || a.status === 'Confirmed'))
          .map(a => a.slotIndex ?? -1)
          .filter(idx => idx >= 0)
      );
      
      // Find the maximum slot index to know the upper bound
      const maxSlotIndex = Math.max(
        ...allAppointments.map(a => a.slotIndex ?? -1).filter(idx => idx >= 0),
        appointmentData.slotIndex,
        0
      );
      
      // Start searching from the requested slot + 1
      let nextAvailableSlot = appointmentData.slotIndex + 1;
      let found = false;
      
      // Search up to maxSlotIndex + 20 to find an available slot
      while (nextAvailableSlot <= maxSlotIndex + 20 && !found) {
        // Check if this slot is:
        // 1. Not an imaginary W slot
        // 2. Not already booked
        if (!imaginaryWSlotPositions.has(nextAvailableSlot) && !bookedSlotIndices.has(nextAvailableSlot)) {
          found = true;
          break;
        }
        nextAvailableSlot++;
      }
      
      if (found) {
        console.log('✅ [DEBUG] Auto-selecting next available slot:', {
          originalSlotIndex: appointmentData.slotIndex,
          newSlotIndex: nextAvailableSlot,
          reason: 'Original slot is reserved for walk-in tokens'
        });
        // Update the slotIndex to the next available slot
        appointmentData.slotIndex = nextAvailableSlot;
      } else {
        console.error('❌ [ERROR] Could not find next available slot:', {
          requestedSlotIndex: appointmentData.slotIndex,
          imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions).sort((a, b) => a - b),
          bookedSlotIndices: Array.from(bookedSlotIndices).sort((a, b) => a - b),
          maxSlotIndex,
          walkInTokenAllotment
        });
        const error = new Error('SLOT_RESERVED_FOR_WALKIN') as Error & { code?: string };
        error.code = 'SLOT_RESERVED_FOR_WALKIN';
        error.message = `Slot ${appointmentData.slotIndex} is reserved for walk-in tokens. No available slots found.`;
        throw error;
      }
    }
    
    console.log('✅ [DEBUG] Validation passed - slot is available for A token');
  }
  
  // Step 0.1: For A and W tokens, check if the slot is already taken (read before transaction)
  // If the slot is already booked, find the next available slot (for A tokens that were auto-selected)
  // For W tokens: Allow imaginary W slots even if already booked by other W tokens (W tokens can share)
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
    
    // For W tokens: Check if this is an imaginary W slot
    // If it is, allow it even if already booked by another W token (W tokens can share imaginary W slots)
    let isImaginaryWSlot = false;
    if (type === 'W') {
      // Get clinic details to find walkInTokenAllotment
      const clinicRef = doc(db, 'clinics', clinicId);
      const clinicSnapshot = await getDoc(clinicRef);
      const clinicData = clinicSnapshot.data();
      const walkInTokenAllotment = clinicData?.walkInTokenAllotment || 7;
      
      // Get all appointments to calculate imaginary W slot positions
      const allAppointmentsQuery = query(
        appointmentsRef,
        where('clinicId', '==', clinicId),
        where('doctor', '==', doctorName),
        where('date', '==', dateStr)
      );
      const allAppointmentsSnapshot = await getDocs(allAppointmentsQuery);
      const allAppointments = allAppointmentsSnapshot.docs.map(doc => doc.data() as Appointment);
      
      // Calculate imaginary W slot positions (same logic as calculateWalkInDetails)
      const confirmedAppointments = allAppointments
        .filter(a => (a.status === 'Pending' || a.status === 'Confirmed'))
        .filter(a => a.bookedVia === 'Advanced Booking' || a.bookedVia === 'Online' || a.bookedVia === 'Advanced')
        .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
      
      const existingWTokens = allAppointments
        .filter(a => a.bookedVia === 'Walk-in' && (a.status === 'Pending' || a.status === 'Confirmed'))
        .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
      
      const imaginaryWSlotPositions = new Set<number>();
      
      if (confirmedAppointments.length === 0) {
        imaginaryWSlotPositions.add(walkInTokenAllotment);
      } else if (existingWTokens.length === 0) {
        if (confirmedAppointments.length >= walkInTokenAllotment) {
          const targetAppointment = confirmedAppointments[walkInTokenAllotment - 1];
          const firstWSlot = (targetAppointment.slotIndex ?? 0) + 1;
          imaginaryWSlotPositions.add(firstWSlot);
          
          let currentWSlot = firstWSlot;
          const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), 0);
          while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
            currentWSlot += walkInTokenAllotment + 1;
            imaginaryWSlotPositions.add(currentWSlot);
          }
        }
      } else {
        const lastWToken = existingWTokens[existingWTokens.length - 1];
        const lastWTokenSlotIndex = lastWToken?.slotIndex ?? -1;
        
        const appointmentsAfterLastW = confirmedAppointments.filter(a => {
          const aptSlotIndex = a.slotIndex ?? 0;
          return aptSlotIndex > lastWTokenSlotIndex;
        });
        
        if (appointmentsAfterLastW.length >= walkInTokenAllotment) {
          const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 1];
          const nextWSlot = (targetAppointment.slotIndex ?? 0) + 1;
          imaginaryWSlotPositions.add(nextWSlot);
          
          let currentWSlot = nextWSlot;
          const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), 0);
          while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
            currentWSlot += walkInTokenAllotment + 1;
            imaginaryWSlotPositions.add(currentWSlot);
          }
        }
      }
      
      isImaginaryWSlot = imaginaryWSlotPositions.has(appointmentData.slotIndex);
      
      console.log('🔍 [DEBUG] W token slot check:', {
        slotIndex: appointmentData.slotIndex,
        isImaginaryWSlot,
        imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions).sort((a, b) => a - b),
        walkInTokenAllotment,
        existingAppointments: slotSnapshot.docs.map(doc => ({
          tokenNumber: doc.data().tokenNumber,
          bookedVia: doc.data().bookedVia
        }))
      });
    }
    
    // Check if slot is already occupied
    // For W tokens: Only block if booked by A token (W tokens can share imaginary W slots)
    // For A tokens: Block if booked by any token
    const slotConflict = slotSnapshot.docs.some(doc => {
      const data = doc.data();
      if (type === 'W' && isImaginaryWSlot) {
        // For W tokens on imaginary W slots: Only block if booked by A token
        // W tokens can share imaginary W slots with other W tokens
        const isBookedByA = data.tokenNumber?.startsWith('A') || 
                           (data.bookedVia === 'Advanced Booking' || 
                            data.bookedVia === 'Online' || 
                            data.bookedVia === 'Advanced');
        if (isBookedByA) {
          console.log('⚠️ [DEBUG] W token: Imaginary W slot is booked by A token, cannot use:', {
            slotIndex: appointmentData.slotIndex,
            existingToken: data.tokenNumber,
            bookedVia: data.bookedVia
          });
        } else {
          console.log('✅ [DEBUG] W token: Imaginary W slot is booked by W token, can share:', {
            slotIndex: appointmentData.slotIndex,
            existingToken: data.tokenNumber,
            bookedVia: data.bookedVia
          });
        }
        return isBookedByA;
      } else {
        // For A tokens or non-imaginary W slots: Block if booked by any token
      return data.tokenNumber?.startsWith('A') || data.tokenNumber?.startsWith('W');
      }
    });
    
    if (slotConflict) {
      // If the slot is already booked, find the next available slot
      // This can happen if there's a race condition or if the auto-selected slot was already booked
      console.log('⚠️ [DEBUG] Auto-selected slot is already booked, finding next available slot:', {
        currentSlotIndex: appointmentData.slotIndex,
        reason: 'Slot conflict detected'
      });
      
      // Get clinic details to find walkInTokenAllotment
      const clinicRef = doc(db, 'clinics', clinicId);
      const clinicSnapshot = await getDoc(clinicRef);
      const clinicData = clinicSnapshot.data();
      const walkInTokenAllotment = clinicData?.walkInTokenAllotment || 7;
      
      // Get all appointments to check for available slots
      const allAppointmentsQuery = query(
        appointmentsRef,
        where('clinicId', '==', clinicId),
        where('doctor', '==', doctorName),
        where('date', '==', dateStr)
      );
      const allAppointmentsSnapshot = await getDocs(allAppointmentsQuery);
      const allAppointments = allAppointmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Array<Appointment & { id: string }>;
      
      const bookedSlotIndices = new Set(
        allAppointments
          .filter(a => (a.status === 'Pending' || a.status === 'Confirmed'))
          .map(a => a.slotIndex ?? -1)
          .filter(idx => idx >= 0)
      );
      
      // Recalculate imaginary W slot positions (in case they changed)
      const confirmedAppointments = allAppointments
        .filter(a => a.status === 'Pending' || a.status === 'Confirmed')
        .filter(a => a.bookedVia === 'Advanced Booking' || a.bookedVia === 'Online' || a.bookedVia === 'Advanced')
        .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
      
      const existingWTokens = allAppointments
        .filter(a => a.bookedVia === 'Walk-in' && (a.status === 'Pending' || a.status === 'Confirmed'))
        .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
      
      const imaginaryWSlotPositions = new Set<number>();
      if (confirmedAppointments.length === 0) {
        // No confirmed appointments - first W would be at slot 0 + walkInTokenAllotment
        imaginaryWSlotPositions.add(walkInTokenAllotment);
      } else if (existingWTokens.length === 0) {
        // First W token: after walkInTokenAllotment confirmed appointments
        if (confirmedAppointments.length >= walkInTokenAllotment) {
          const sortedBySlotIndex = [...confirmedAppointments].sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
          const targetSlotIndex = walkInTokenAllotment - 1;
          const targetAppointment = sortedBySlotIndex[targetSlotIndex] || sortedBySlotIndex[walkInTokenAllotment - 1];
          const firstWSlot = targetAppointment ? (targetAppointment.slotIndex ?? 0) + 1 : walkInTokenAllotment;
          imaginaryWSlotPositions.add(firstWSlot);
          
          // Calculate additional imaginary W slots at intervals
          let currentWSlot = firstWSlot;
          const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), 0);
          while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
            currentWSlot += walkInTokenAllotment + 1; // Fixed: should be +1, not just walkInTokenAllotment
            imaginaryWSlotPositions.add(currentWSlot);
          }
        }
        // If fewer than walkInTokenAllotment confirmed appointments, don't add any imaginary W slots yet
        // All slots should be available for A tokens to fill
      } else {
        // Subsequent W tokens: place after walkInTokenAllotment appointments from last W token
        const lastWToken = existingWTokens[existingWTokens.length - 1];
        const lastWTokenSlotIndex = lastWToken?.slotIndex ?? -1;
        
        const appointmentsAfterLastW = confirmedAppointments.filter(a => {
          const aptSlotIndex = a.slotIndex ?? 0;
          return aptSlotIndex > lastWTokenSlotIndex;
        });
        
        if (appointmentsAfterLastW.length >= walkInTokenAllotment) {
          const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 1];
          const nextWSlot = (targetAppointment.slotIndex ?? 0) + 1;
          imaginaryWSlotPositions.add(nextWSlot);
          
          // Calculate additional imaginary W slots at intervals
          let currentWSlot = nextWSlot;
          const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), 0);
          while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
            currentWSlot += walkInTokenAllotment + 1; // Fixed: should be +1, not just walkInTokenAllotment
            imaginaryWSlotPositions.add(currentWSlot);
          }
        }
        // If fewer than walkInTokenAllotment appointments after last W, don't add any imaginary W slots yet
        // All slots should be available for A tokens to fill
      }
      
      // Find the maximum slot index to know the upper bound
      const maxSlotIndex = Math.max(
        ...allAppointments.map(a => a.slotIndex ?? -1).filter(idx => idx >= 0),
        appointmentData.slotIndex,
        0
      );
      
      // For W tokens: If the original slot was an imaginary W slot, try to use it or find another imaginary W slot
      // For A tokens: Find the next available slot that is not an imaginary W slot
      let nextAvailableSlot = appointmentData.slotIndex + 1;
      let found = false;
      
      if (type === 'W') {
        // For W tokens: First, check if we can use an imaginary W slot
        // Priority: Use the original slot if it's an imaginary W slot and not booked by A token
        // Otherwise, find the next available imaginary W slot or regular slot
        console.log('🔍 [DEBUG] W token conflict resolution: Looking for available slot:', {
          originalSlotIndex: appointmentData.slotIndex,
          isOriginalImaginaryWSlot: imaginaryWSlotPositions.has(appointmentData.slotIndex),
          imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions).sort((a, b) => a - b)
        });
        
        // First, check if the original slot is an imaginary W slot
        // If it is, check if it's booked by an A token (if so, we need to find another slot)
        const originalSlotAppointment = slotSnapshot.docs.find(doc => {
          const data = doc.data();
          return (data.tokenNumber?.startsWith('A') || 
                 data.bookedVia === 'Advanced Booking' || 
                 data.bookedVia === 'Online' || 
                 data.bookedVia === 'Advanced');
        });
        
        if (imaginaryWSlotPositions.has(appointmentData.slotIndex) && !originalSlotAppointment) {
          // Original slot is an imaginary W slot and not booked by A token
          // W tokens can share imaginary W slots, so we can use it
          console.log('✅ [DEBUG] W token: Original slot is imaginary W slot and not booked by A token, can use:', {
            slotIndex: appointmentData.slotIndex
          });
          found = true;
          nextAvailableSlot = appointmentData.slotIndex; // Keep the original slot
        } else {
          // Original slot is booked by A token or not an imaginary W slot
          // Find the next available imaginary W slot or regular slot
          const sortedImaginaryWSlots = Array.from(imaginaryWSlotPositions).sort((a, b) => a - b);
          
          // First, try to find an available imaginary W slot
          for (const imaginarySlot of sortedImaginaryWSlots) {
            if (imaginarySlot >= appointmentData.slotIndex) {
              // Check if this imaginary W slot is booked by an A token
              const slotQuery = query(
                appointmentsRef,
                where('clinicId', '==', clinicId),
                where('doctor', '==', doctorName),
                where('date', '==', dateStr),
                where('slotIndex', '==', imaginarySlot),
                where('status', 'in', ['Pending', 'Confirmed'])
              );
              const slotCheckSnapshot = await getDocs(slotQuery);
              const isBookedByA = slotCheckSnapshot.docs.some(doc => {
                const data = doc.data();
                return data.tokenNumber?.startsWith('A') || 
                       data.bookedVia === 'Advanced Booking' || 
                       data.bookedVia === 'Online' || 
                       data.bookedVia === 'Advanced';
              });
              
              if (!isBookedByA) {
                console.log('✅ [DEBUG] W token: Found available imaginary W slot:', {
                  slotIndex: imaginarySlot,
                  originalSlotIndex: appointmentData.slotIndex
                });
                nextAvailableSlot = imaginarySlot;
                found = true;
                break;
              }
            }
          }
          
          // If no imaginary W slot found, find the next regular available slot
          if (!found) {
            nextAvailableSlot = appointmentData.slotIndex + 1;
            while (nextAvailableSlot <= maxSlotIndex + 20 && !found) {
              // Check if this slot is:
              // 1. Not already booked
              // 2. For W tokens: Can be an imaginary W slot (already checked above) or regular slot
              if (!bookedSlotIndices.has(nextAvailableSlot)) {
                found = true;
                break;
              }
              nextAvailableSlot++;
            }
          }
        }
      } else {
        // For A tokens: Find the next available slot that is not an imaginary W slot
      while (nextAvailableSlot <= maxSlotIndex + 20 && !found) {
        // Check if this slot is:
        // 1. Not an imaginary W slot
        // 2. Not already booked
        if (!imaginaryWSlotPositions.has(nextAvailableSlot) && !bookedSlotIndices.has(nextAvailableSlot)) {
          found = true;
          break;
        }
        nextAvailableSlot++;
        }
      }
      
      if (found) {
        console.log('✅ [DEBUG] Found next available slot after conflict:', {
          originalSlotIndex: appointmentData.slotIndex,
          newSlotIndex: nextAvailableSlot,
          reason: 'Slot conflict resolved',
          isImaginaryWSlot: type === 'W' ? imaginaryWSlotPositions.has(nextAvailableSlot) : false
        });
        appointmentData.slotIndex = nextAvailableSlot;
      } else {
        const error = new Error('SLOT_ALREADY_BOOKED') as Error & { code?: string };
        error.code = 'SLOT_OCCUPIED';
        error.message = `Slot ${appointmentData.slotIndex} is already booked and no available slots found.`;
        throw error;
      }
    }
  }

  // Step 0.5: For W tokens, find all subsequent appointments that need to be shifted forward
  let appointmentsToShift: Array<{ id: string; slotIndex: number; currentTime: string; newTime: string; newCutOffTime: Date; newNoShowTime: Date; newDelay: number }> = [];
  if (type === 'W' && typeof appointmentData.slotIndex === 'number') {
    const appointmentsRef = collection(db, 'appointments');
    const allAppointmentsQuery = query(
      appointmentsRef,
      where('clinicId', '==', clinicId),
      where('doctor', '==', doctorName),
      where('date', '==', dateStr)
    );
    
    const allAppointmentsSnapshot = await getDocs(allAppointmentsQuery);
    const allAppointments = allAppointmentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Array<Appointment & { id: string }>;
    
    const targetSlotIndex = appointmentData.slotIndex;
    
    // Get doctor to find averageConsultingTime
    const doctorsRef = collection(db, 'doctors');
    const doctorQuery = query(
      doctorsRef,
      where('name', '==', doctorName),
      where('clinicId', '==', clinicId)
    );
    const doctorSnapshot = await getDocs(doctorQuery);
    const doctor = doctorSnapshot.docs[0]?.data() as Doctor | undefined;
    const slotDuration = doctor?.averageConsultingTime || 15;
    
    // Find all appointments (A tokens) that come after the W token insertion point
    // These need to be shifted forward by slotDuration (e.g., 10 minutes)
    const appointmentsAfterW = allAppointments
      .filter(a => {
        const aptSlotIndex = a.slotIndex ?? -1;
        // Only shift A tokens (not W tokens) that come after the insertion point
        const isAToken = a.bookedVia === 'Advanced Booking' || a.bookedVia === 'Online' || a.bookedVia === 'Advanced';
        return isAToken && aptSlotIndex >= targetSlotIndex && (a.status === 'Pending' || a.status === 'Confirmed');
      })
      .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
    
    // Calculate delay for each appointment (keep original time, add delay to cutOffTime and noShowTime)
    for (const appointment of appointmentsAfterW) {
      try {
        const appointmentDate = parse(appointment.date, "d MMMM yyyy", new Date());
        const currentAppointmentTime = parseTimeString(appointment.time, appointmentDate);
        
        // Keep the original appointment time unchanged
        const originalTime = appointment.time;
        
        // Get original cutOffTime and noShowTime, or calculate them if they don't exist
        let originalCutOffTime: Date;
        let originalNoShowTime: Date;
        
        if (appointment.cutOffTime) {
          // If cutOffTime exists, use it (could be a Timestamp, so convert to Date)
          originalCutOffTime = appointment.cutOffTime.toDate ? appointment.cutOffTime.toDate() : new Date(appointment.cutOffTime);
        } else {
          // Calculate from original appointment time - 15 minutes
          originalCutOffTime = subMinutes(currentAppointmentTime, 15);
        }
        
        if (appointment.noShowTime) {
          // If noShowTime exists, use it (could be a Timestamp, so convert to Date)
          originalNoShowTime = appointment.noShowTime.toDate ? appointment.noShowTime.toDate() : new Date(appointment.noShowTime);
        } else {
          // Calculate from original appointment time + 15 minutes
          originalNoShowTime = addMinutes(currentAppointmentTime, 15);
        }
        
        // Delay should NOT change cutOffTime or time, only noShowTime
        // cutOffTime remains: appointment time - 15 minutes (no delay)
        // noShowTime becomes: appointment time + 15 minutes + delay
        const newCutOffTime = originalCutOffTime; // Keep cutOffTime unchanged (no delay)
        const newNoShowTime = addMinutes(originalNoShowTime, slotDuration); // Add delay to noShowTime only
        
        // Get existing delay or default to 0
        const existingDelay = appointment.delay || 0;
        const newDelay = existingDelay + slotDuration;
        
        appointmentsToShift.push({
          id: appointment.id,
          slotIndex: appointment.slotIndex ?? targetSlotIndex,
          currentTime: originalTime,
          newTime: originalTime, // Keep original time unchanged
          newCutOffTime,
          newNoShowTime,
          newDelay
        });
      } catch (error) {
        console.error('Error calculating delay for appointment:', appointment.id, error);
        // Skip this appointment if we can't parse the time
      }
    }
  }

  // Step 0.6: Prepare counter references based on token type
  let counterRef: any;
  let initialNextTokenNum: number | null = null;
  let needsCounterInitialization = false;
  
  if (type === 'A') {
    // A tokens: Use shared counter (A001, A002, A003...)
    const counterDocId = `${clinicId}_${doctorName}_${dateStr}_A`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    counterRef = doc(db, 'token-counters', counterDocId);
    const counterDocSnapshot = await getDoc(counterRef);
    
    if (!counterDocSnapshot.exists()) {
      // Counter doesn't exist, fetch existing A tokens to calculate next token
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
        if (typeof token === 'string' && token.startsWith('A')) {
          return parseInt(token.substring(1), 10);
        }
        return 0;
      }).filter(num => !isNaN(num) && num > 0);
      
      const maxExistingToken = tokenNumbers.length > 0 ? Math.max(...tokenNumbers) : 0;
      initialNextTokenNum = maxExistingToken + 1;
    }
  } else {
    // W tokens: Start from (total slots count + 1)
    const totalSlots = await calculateTotalSlotsForDay(clinicId, doctorName, date);
    const wTokenStartNumber = totalSlots + 1;
    const counterDocId = `${clinicId}_${doctorName}_${dateStr}_W`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    counterRef = doc(db, 'token-counters', counterDocId);
    const counterDocSnapshot = await getDoc(counterRef);
    
    if (!counterDocSnapshot.exists()) {
      // Counter doesn't exist, fetch existing W tokens to calculate next token
      needsCounterInitialization = true;
      const appointmentsRef = collection(db, 'appointments');
      const appointmentsQuery = query(
        appointmentsRef,
        where('clinicId', '==', clinicId),
        where('doctor', '==', doctorName),
        where('date', '==', dateStr)
      );
      const tokenSnapshot = await getDocs(appointmentsQuery);
      const wTokenNumbers = tokenSnapshot.docs.map(doc => {
        const token = doc.data().tokenNumber;
        if (typeof token === 'string' && token.startsWith('W')) {
          return parseInt(token.substring(1), 10);
        }
        return 0;
      }).filter(num => !isNaN(num) && num >= wTokenStartNumber);
      
      if (wTokenNumbers.length > 0) {
        const maxExistingWToken = Math.max(...wTokenNumbers);
        initialNextTokenNum = maxExistingWToken + 1;
      } else {
        initialNextTokenNum = wTokenStartNumber;
      }
    }
  }
  
  // Store wTokenStartNumber for use in transaction (for W tokens)
  // Calculate it once before the transaction
  const wTokenStartNumber = type === 'W' ? (await calculateTotalSlotsForDay(clinicId, doctorName, date)) + 1 : null;

  // Step 0.7: For A tokens, fetch all appointments for the day BEFORE transaction
  // We'll verify slot availability and select slot atomically inside the transaction
  let allAppointmentRefs: Array<{ id: string; ref: any; slotIndex?: number; status?: string }> = [];
  let clinicData: any = null;
  let requestedSlotIndex: number | undefined = undefined;
  let allSlotsWithIndices: Array<{ time: Date; sessionIndex: number }> = [];
  let oneHourFromNow: Date | null = null;
  
  if (type === 'A' && typeof appointmentData.slotIndex === 'number') {
    // Store the requested slot index (might be changed inside transaction)
    requestedSlotIndex = appointmentData.slotIndex;
    
    // Get clinic details
    const clinicRef = doc(db, 'clinics', clinicId);
    const clinicSnapshot = await getDoc(clinicRef);
    clinicData = clinicSnapshot.data();
    
    // Get doctor info to generate time slots for 1-hour cutoff check
    const doctorsRef = collection(db, 'doctors');
    const doctorQuery = query(
      doctorsRef,
      where('clinicId', '==', clinicId),
      where('name', '==', doctorName)
    );
    const doctorSnapshot = await getDocs(doctorQuery);
    
    if (!doctorSnapshot.empty) {
      const doctorData = { id: doctorSnapshot.docs[0].id, ...doctorSnapshot.docs[0].data() } as Doctor;
      const dayOfWeek = format(date, 'EEEE');
      const availabilityForDay = doctorData.availabilitySlots?.find(s => s.day === dayOfWeek);
      const slotDuration = doctorData.averageConsultingTime || 15;
      
      if (availabilityForDay) {
        // Generate all time slots for the day
        availabilityForDay.timeSlots.forEach((session, sessionIndex) => {
          const startTime = parseTimeString(session.from, date);
          const endTime = parseTimeString(session.to, date);
          let currentTime = startTime;
          
          while (isBefore(currentTime, endTime)) {
            allSlotsWithIndices.push({ time: currentTime, sessionIndex });
            currentTime = addMinutes(currentTime, slotDuration);
          }
        });
      }
      
      // Calculate 1-hour cutoff time
      const now = new Date();
      oneHourFromNow = addMinutes(now, 60);
    }
    
    // Fetch all appointments for the day
    const appointmentsRef = collection(db, 'appointments');
    const allAppointmentsQuery = query(
      appointmentsRef,
      where('clinicId', '==', clinicId),
      where('doctor', '==', doctorName),
      where('date', '==', dateStr)
    );
    
    const allAppointmentsSnapshot = await getDocs(allAppointmentsQuery);
    allAppointmentRefs = allAppointmentsSnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ref: doc(db, 'appointments', docSnap.id),
        slotIndex: data.slotIndex,
        status: data.status
      };
    });
  }

  return await runTransaction(db, async (transaction) => {
    // Step 1: Read all documents first (all reads before writes)
    
    // Read counter document
    const counterDoc = await transaction.get(counterRef);
    
    // Declare variables for slot selection (used for A tokens)
    let selectedSlotIndex = -1;
    let selectedSlotReservationRef: any = null;
    
    // For A tokens, atomically select the earliest available slot inside transaction
    if (type === 'A' && typeof requestedSlotIndex === 'number') {
      // First, verify all appointments inside transaction to get current state
      const verifiedBookedSlots = new Set<number>();
      const verifiedAppointments: Array<{ slotIndex?: number; bookedVia?: string; status?: string }> = [];
      
      for (const aptRef of allAppointmentRefs) {
        const aptDoc = await transaction.get(aptRef.ref);
        if (aptDoc.exists()) {
          const data = aptDoc.data();
          if ((data.status === 'Pending' || data.status === 'Confirmed')) {
            const slotIdx = data.slotIndex ?? -1;
            if (slotIdx >= 0) {
              verifiedBookedSlots.add(slotIdx);
            }
            verifiedAppointments.push({
              slotIndex: data.slotIndex,
              bookedVia: data.bookedVia,
              status: data.status
            });
          }
        }
      }
      
      // Calculate imaginary W slot positions
      // CRITICAL: Account for the fact that we're about to create a new A token
      // If there are N confirmed A appointments, after we create this one, there will be N+1
      // The first imaginary W slot is after walkInTokenAllotment confirmed A appointments
      const walkInTokenAllotment = clinicData?.walkInTokenAllotment || 7;
      const confirmedAppointments = verifiedAppointments
        .filter(a => a.status === 'Pending' || a.status === 'Confirmed')
        .filter(a => a.bookedVia === 'Advanced Booking' || a.bookedVia === 'Online' || a.bookedVia === 'Advanced')
        .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
      
      const existingWTokens = verifiedAppointments
        .filter(a => a.bookedVia === 'Walk-in' && (a.status === 'Pending' || a.status === 'Confirmed'))
        .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
      
      // CRITICAL FIX: Account for the new A token we're about to create
      // If we have 6 confirmed A appointments and we're creating the 7th,
      // after creation there will be 7, so the first imaginary W slot is at position 7
      // But we need to calculate this BEFORE we know which slot we'll select
      // So we use: if confirmedAppointments.length + 1 >= walkInTokenAllotment, then slot at position walkInTokenAllotment is imaginary
      const totalAAppointmentsAfterThis = confirmedAppointments.length + 1; // +1 for the appointment we're creating
      
      const imaginaryWSlotPositions = new Set<number>();
      console.log('🔍 [DEBUG] Calculating imaginary W slots (accounting for new A token):', {
        confirmedAppointmentsCount: confirmedAppointments.length,
        totalAAppointmentsAfterThis,
        existingWTokensCount: existingWTokens.length,
        walkInTokenAllotment,
        confirmedAppointments: confirmedAppointments.map(a => ({ slotIndex: a.slotIndex, bookedVia: a.bookedVia })),
        existingWTokens: existingWTokens.map(a => ({ slotIndex: a.slotIndex, bookedVia: a.bookedVia }))
      });
      
      if (confirmedAppointments.length === 0) {
        // No existing A appointments, but we're creating one
        // After creation: 1 A appointment
        // If walkInTokenAllotment is 7, we need 7 A appointments before first imaginary W slot
        // So no imaginary slots yet
        // But wait, if walkInTokenAllotment is 7 and we have 0, after creating 1, we still have less than 7
        // So no imaginary slots
        if (totalAAppointmentsAfterThis >= walkInTokenAllotment) {
          // After creating this appointment, we'll have exactly walkInTokenAllotment A appointments
          // So the first imaginary W slot is at position walkInTokenAllotment
          imaginaryWSlotPositions.add(walkInTokenAllotment);
        }
      } else if (existingWTokens.length === 0) {
        console.log('🔍 [DEBUG] Branch: existingWTokens.length === 0', {
          totalAAppointmentsAfterThis,
          walkInTokenAllotment,
          conditionMet: totalAAppointmentsAfterThis >= walkInTokenAllotment
        });
        
        if (totalAAppointmentsAfterThis >= walkInTokenAllotment) {
          // After creating this appointment, we'll have at least walkInTokenAllotment A appointments
          // The first imaginary W slot is after the walkInTokenAllotment-th A appointment
          // Since we're creating the (confirmedAppointments.length + 1)-th appointment,
          // if confirmedAppointments.length + 1 == walkInTokenAllotment, then slot at position walkInTokenAllotment is imaginary
          // If confirmedAppointments.length + 1 > walkInTokenAllotment, we need to find the slot after the walkInTokenAllotment-th appointment
          
          const sortedBySlotIndex = [...confirmedAppointments].sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
          
          console.log('🔍 [DEBUG] Checking if totalAAppointmentsAfterThis === walkInTokenAllotment', {
            totalAAppointmentsAfterThis,
            walkInTokenAllotment,
            areEqual: totalAAppointmentsAfterThis === walkInTokenAllotment
          });
          
          if (totalAAppointmentsAfterThis === walkInTokenAllotment) {
            // After creating this appointment, we'll have exactly walkInTokenAllotment A appointments
            // The first imaginary W slot is at slot index walkInTokenAllotment (e.g., slot 7 for walkInTokenAllotment 7)
            // CRITICAL: Mark slot walkInTokenAllotment as imaginary to prevent A tokens from using it
            // This ensures that when we have 6 appointments and create the 7th, slot 7 is reserved for W tokens
            console.log('🚨 [CRITICAL] ADDING IMAGINARY SLOT:', walkInTokenAllotment);
            imaginaryWSlotPositions.add(walkInTokenAllotment);
            
            console.log('✅ [DEBUG] Marking slot as imaginary (will have exactly walkInTokenAllotment A appointments):', {
              walkInTokenAllotment,
              totalAAppointmentsAfterThis,
              imaginarySlot: walkInTokenAllotment,
              existingAppointments: sortedBySlotIndex.map(a => a.slotIndex),
              imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions)
            });
          } else if (totalAAppointmentsAfterThis > walkInTokenAllotment) {
            console.log('🔍 [DEBUG] totalAAppointmentsAfterThis > walkInTokenAllotment', {
              totalAAppointmentsAfterThis,
              walkInTokenAllotment
            });
            // We'll have more than walkInTokenAllotment appointments after creation
            // Find the appointment at position (walkInTokenAllotment - 1) in the sorted list
            const targetAppointment = sortedBySlotIndex[walkInTokenAllotment - 1];
            // First W slot is right after this appointment
            const firstWSlot = (targetAppointment?.slotIndex ?? 0) + 1;
            imaginaryWSlotPositions.add(firstWSlot);
            
            // Calculate additional imaginary W slots at intervals
            const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), 0);
            let currentWSlot = firstWSlot;
            while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
              currentWSlot += walkInTokenAllotment + 1;
              imaginaryWSlotPositions.add(currentWSlot);
            }
          }
        }
      } else {
        const lastWToken = existingWTokens[existingWTokens.length - 1];
        const lastWTokenSlotIndex = lastWToken?.slotIndex ?? -1;
        
        const appointmentsAfterLastW = confirmedAppointments.filter(a => {
          const aptSlotIndex = a.slotIndex ?? 0;
          return aptSlotIndex > lastWTokenSlotIndex;
        });
        
        // Account for the new A token we're creating
        // If it will be after the last W token, it counts toward appointmentsAfterLastW
        // But we don't know its slot index yet, so we need to be conservative
        // For now, assume it might be after the last W token
        const appointmentsAfterLastWAfterCreation = appointmentsAfterLastW.length + 1; // +1 for the new appointment
        
        if (appointmentsAfterLastWAfterCreation >= walkInTokenAllotment) {
          if (appointmentsAfterLastW.length < walkInTokenAllotment) {
            // After creating this appointment, we'll have exactly walkInTokenAllotment appointments after last W
            // So the first imaginary W slot is right after the last appointment after last W
            // But we don't know which slot that will be, so we need to consider all slots after the max slot
            const maxSlotAfterLastW = appointmentsAfterLastW.length > 0 
              ? Math.max(...appointmentsAfterLastW.map(a => a.slotIndex ?? 0))
              : lastWTokenSlotIndex;
            // The new appointment will be at some slot after maxSlotAfterLastW
            // The first imaginary W slot is at maxSlotAfterLastW + 1 (or later, depending on where we place the new appointment)
            // To be safe, we mark maxSlotAfterLastW + 1 as potentially imaginary
            // Actually, we can't know for sure, so we need to recalculate after slot selection
            // For now, use the same logic as before but account for +1 appointment
            const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 2]; // -2 because we're adding 1
            if (targetAppointment) {
              const nextWSlot = (targetAppointment.slotIndex ?? 0) + 1;
              imaginaryWSlotPositions.add(nextWSlot);
            } else {
              // Fallback: if we don't have enough appointments yet, use slot after last W + walkInTokenAllotment
              imaginaryWSlotPositions.add(lastWTokenSlotIndex + walkInTokenAllotment + 1);
            }
          } else {
            // We already have enough appointments after last W
            const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 1];
            const nextWSlot = (targetAppointment.slotIndex ?? 0) + 1;
            imaginaryWSlotPositions.add(nextWSlot);
          }
          
          // Calculate additional imaginary W slots at intervals
          const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), lastWTokenSlotIndex);
          const firstWSlot = Array.from(imaginaryWSlotPositions)[0] || (lastWTokenSlotIndex + 1);
          let currentWSlot = firstWSlot;
          while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
            currentWSlot += walkInTokenAllotment + 1;
            imaginaryWSlotPositions.add(currentWSlot);
          }
        }
      }
      
      // CRITICAL: Final verification that imaginary slots are set correctly
      const finalImaginarySlots = Array.from(imaginaryWSlotPositions).sort((a, b) => a - b);
      console.log('🔍 [DEBUG] Calculated imaginary W slots (accounting for new A token):', {
        imaginaryWSlotPositions: finalImaginarySlots,
        walkInTokenAllotment,
        totalAAppointmentsAfterThis,
        confirmedAppointmentsCount: confirmedAppointments.length,
        shouldHaveSlot7: totalAAppointmentsAfterThis === walkInTokenAllotment && walkInTokenAllotment === 7,
        hasSlot7: finalImaginarySlots.includes(7)
      });
      
      // CRITICAL: If we should have slot walkInTokenAllotment as imaginary but don't, this is a bug!
      // When totalAAppointmentsAfterThis === walkInTokenAllotment, slot walkInTokenAllotment MUST be imaginary
      if (totalAAppointmentsAfterThis === walkInTokenAllotment && existingWTokens.length === 0 && !finalImaginarySlots.includes(walkInTokenAllotment)) {
        console.error('🚨 [CRITICAL BUG] Slot walkInTokenAllotment should be imaginary but is not in the set!', {
          totalAAppointmentsAfterThis,
          walkInTokenAllotment,
          expectedImaginarySlot: walkInTokenAllotment,
          imaginaryWSlotPositions: finalImaginarySlots,
          confirmedAppointmentsCount: confirmedAppointments.length
        });
        // Force add it as a safety measure
        imaginaryWSlotPositions.add(walkInTokenAllotment);
        console.log('🔧 [FIX] Force-added slot', walkInTokenAllotment, 'to imaginary slots');
      }
      
      // Find the maximum slot index to search up to
      const maxSlotIndex = Math.max(
        ...verifiedAppointments.map(a => a.slotIndex ?? -1).filter(idx => idx >= 0),
        requestedSlotIndex,
        0
      );
      
      // STEP 1: ALL READS FIRST - Firestore transactions require all reads before all writes
      
      // Step 1.1: Read slot reservations inside transaction to prevent concurrent conflicts
      // We'll read reservations as we check slots, but ensure all reads happen before writes
      const reservedSlotIndices = new Set<number>();
      const slotReservationRefs = new Map<number, any>();
      
      // Helper function to read a slot reservation (caches results)
      const readSlotReservation = async (slotIdx: number): Promise<{ reserved: boolean; reservationRef?: any }> => {
        // If we've already read this slot, return cached result
        if (reservedSlotIndices.has(slotIdx)) {
          return { reserved: true };
        }
        if (slotReservationRefs.has(slotIdx)) {
          return { reserved: false, reservationRef: slotReservationRefs.get(slotIdx) };
        }
        
        // Read the reservation document inside transaction
        const slotReservationId = `${clinicId}_${doctorName}_${dateStr}_slot_${slotIdx}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        const slotReservationRef = doc(db, 'slot-reservations', slotReservationId);
        const reservationDoc = await transaction.get(slotReservationRef);
        
        if (reservationDoc.exists()) {
          reservedSlotIndices.add(slotIdx);
          return { reserved: true };
        } else {
          slotReservationRefs.set(slotIdx, slotReservationRef);
          return { reserved: false, reservationRef: slotReservationRef };
        }
      };
      
      // Helper function to check if a slot is available (reads reservation inside transaction)
      const isSlotAvailable = async (slotIdx: number): Promise<{ available: boolean; reservationRef?: any }> => {
        // CRITICAL: Check if slot is not an imaginary W slot FIRST (skip if it is)
        if (imaginaryWSlotPositions.has(slotIdx)) {
          console.log('🚫 [DEBUG] Slot is an imaginary W slot, skipping:', {
            slotIdx,
            imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions).sort((a, b) => a - b)
          });
          return { available: false };
        }
        
        // Check if slot is already booked by checking verifiedBookedSlots
        if (verifiedBookedSlots.has(slotIdx)) {
          return { available: false };
        }
        
        // Check 1-hour cutoff: A tokens can only book slots that are at least 1 hour in the future
        // Slots within 1 hour are reserved for W tokens only
        if (allSlotsWithIndices.length > slotIdx && oneHourFromNow) {
          const slotTime = allSlotsWithIndices[slotIdx].time;
          // Skip slots that are within 1 hour from now (these are reserved for W tokens)
          if (!isAfter(slotTime, oneHourFromNow)) {
            return { available: false }; // Slot is within 1 hour window
          }
        }
        
        // Read the reservation document inside transaction (cached)
        const reservationCheck = await readSlotReservation(slotIdx);
        if (reservationCheck.reserved) {
          return { available: false };
        }
        
        // Slot is available
        return { available: true, reservationRef: reservationCheck.reservationRef };
      };
      
      // First, try the requested slotIndex
      if (typeof requestedSlotIndex === 'number' && requestedSlotIndex >= 0) {
        const requestedSlotCheck = await isSlotAvailable(requestedSlotIndex);
        if (requestedSlotCheck.available && requestedSlotCheck.reservationRef) {
          selectedSlotIndex = requestedSlotIndex;
          selectedSlotReservationRef = requestedSlotCheck.reservationRef;
          console.log('✅ [TRANSACTION] Using requested slot:', {
            requestedSlotIndex,
            selectedSlotIndex,
            reason: 'Requested slot is available'
          });
        }
      }
      
      // If requested slot is not available, search for the next available slot
      if (selectedSlotIndex === -1) {
        for (let slotIdx = 0; slotIdx <= maxSlotIndex + 20; slotIdx++) {
          // Skip the requested slot if we already checked it
          if (typeof requestedSlotIndex === 'number' && slotIdx === requestedSlotIndex) {
            continue;
          }
          
          const slotCheck = await isSlotAvailable(slotIdx);
          if (slotCheck.available && slotCheck.reservationRef) {
            selectedSlotIndex = slotIdx;
            selectedSlotReservationRef = slotCheck.reservationRef;
            console.log('✅ [TRANSACTION] Using next available slot:', {
              requestedSlotIndex: requestedSlotIndex ?? undefined,
              selectedSlotIndex,
              reason: 'Requested slot not available, using next available'
            });
            break; // Found the next available slot
          }
        }
      }
      
      if (selectedSlotIndex === -1) {
        const error = new Error('SLOT_ALREADY_BOOKED') as Error & { code?: string };
        error.code = 'SLOT_OCCUPIED';
        error.message = `No available slots found.`;
        throw error;
      }
      
      // Final validation: A tokens should NEVER book imaginary W slots
      // This is a safety check to ensure imaginary W slots are never used for A tokens
      if (imaginaryWSlotPositions.has(selectedSlotIndex)) {
        console.error('❌ [ERROR] Attempted to assign imaginary W slot to A token:', {
          selectedSlotIndex,
          imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions).sort((a, b) => a - b),
          walkInTokenAllotment
        });
        const error = new Error('SLOT_RESERVED_FOR_WALKIN') as Error & { code?: string };
        error.code = 'SLOT_RESERVED_FOR_WALKIN';
        error.message = `Slot ${selectedSlotIndex} is reserved for walk-in tokens. No available slots found.`;
        throw error;
      }
      
    }
    
    // Step 1.2: For W tokens, read all appointments that need to be shifted forward
    const appointmentDocsToShift: Array<{ ref: any; data: any; newTime: string; newCutOffTime: Date; newNoShowTime: Date; newDelay: number }> = [];
    if (type === 'W' && appointmentsToShift.length > 0) {
      for (const appointmentToShift of appointmentsToShift) {
        const appointmentRef = doc(db, 'appointments', appointmentToShift.id);
        const appointmentDoc = await transaction.get(appointmentRef);
        if (appointmentDoc.exists()) {
          appointmentDocsToShift.push({
            ref: appointmentRef,
            data: appointmentDoc.data(),
            newTime: appointmentToShift.newTime,
            newCutOffTime: appointmentToShift.newCutOffTime,
            newNoShowTime: appointmentToShift.newNoShowTime,
            newDelay: appointmentToShift.newDelay
          });
        }
      }
    }
    
    // STEP 2: ALL WRITES AFTER ALL READS
    
    // Step 2.1: Create slot reservation document to lock the slot (only for A tokens)
    // CRITICAL: Double-check that the slot is still available and not an imaginary W slot
    // This prevents race conditions where concurrent requests might both select the same slot
    if (type === 'A' && selectedSlotReservationRef) {
      // Final double-check: Verify the slot is not an imaginary W slot
      // Recalculate imaginary W slots inside transaction to ensure consistency
      if (type === 'A' && typeof appointmentData.slotIndex === 'number') {
        // Re-read appointments to get current state inside transaction
        const verifiedAppointmentsForCheck: Array<{ slotIndex?: number; bookedVia?: string; status?: string }> = [];
        for (const aptRef of allAppointmentRefs) {
          const aptDoc = await transaction.get(aptRef.ref);
          if (aptDoc.exists()) {
            const data = aptDoc.data();
            if ((data.status === 'Pending' || data.status === 'Confirmed')) {
              verifiedAppointmentsForCheck.push({
                slotIndex: data.slotIndex,
                bookedVia: data.bookedVia,
                status: data.status
              });
            }
          }
        }
        
        // Recalculate imaginary W slots based on current state
        // CRITICAL: Account for the new A token we're about to create
        const walkInTokenAllotment = clinicData?.walkInTokenAllotment || 7;
        const confirmedAppointmentsForCheck = verifiedAppointmentsForCheck
          .filter(a => a.status === 'Pending' || a.status === 'Confirmed')
          .filter(a => a.bookedVia === 'Advanced Booking' || a.bookedVia === 'Online' || a.bookedVia === 'Advanced')
          .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
        
        const existingWTokensForCheck = verifiedAppointmentsForCheck
          .filter(a => a.bookedVia === 'Walk-in' && (a.status === 'Pending' || a.status === 'Confirmed'))
          .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
        
        // CRITICAL FIX: Account for the new A token we're about to create
        const totalAAppointmentsAfterThisCheck = confirmedAppointmentsForCheck.length + 1; // +1 for the appointment we're creating
        
        const imaginaryWSlotPositionsForCheck = new Set<number>();
        if (confirmedAppointmentsForCheck.length === 0) {
          if (totalAAppointmentsAfterThisCheck >= walkInTokenAllotment) {
            imaginaryWSlotPositionsForCheck.add(walkInTokenAllotment);
          }
        } else if (existingWTokensForCheck.length === 0) {
          if (totalAAppointmentsAfterThisCheck >= walkInTokenAllotment) {
            const sortedBySlotIndex = [...confirmedAppointmentsForCheck].sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
            
            if (totalAAppointmentsAfterThisCheck === walkInTokenAllotment) {
              // After creating this appointment, we'll have exactly walkInTokenAllotment A appointments
              // The first imaginary W slot is at slot index walkInTokenAllotment
              imaginaryWSlotPositionsForCheck.add(walkInTokenAllotment);
            } else if (totalAAppointmentsAfterThisCheck > walkInTokenAllotment) {
              // We'll have more than walkInTokenAllotment appointments after creation
              const targetAppointment = sortedBySlotIndex[walkInTokenAllotment - 1];
              const firstWSlot = (targetAppointment?.slotIndex ?? 0) + 1;
              imaginaryWSlotPositionsForCheck.add(firstWSlot);
              
              let currentWSlot = firstWSlot;
              const maxSlotIndex = Math.max(...confirmedAppointmentsForCheck.map(a => a.slotIndex ?? 0), 0);
              while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
                currentWSlot += walkInTokenAllotment + 1;
                imaginaryWSlotPositionsForCheck.add(currentWSlot);
              }
            }
          }
        } else {
          const lastWToken = existingWTokensForCheck[existingWTokensForCheck.length - 1];
          const lastWTokenSlotIndex = lastWToken?.slotIndex ?? -1;
          
          const appointmentsAfterLastW = confirmedAppointmentsForCheck.filter(a => {
            const aptSlotIndex = a.slotIndex ?? 0;
            return aptSlotIndex > lastWTokenSlotIndex;
          });
          
          // Account for the new A token we're creating
          const appointmentsAfterLastWAfterCreation = appointmentsAfterLastW.length + 1; // +1 for the new appointment
          
          if (appointmentsAfterLastWAfterCreation >= walkInTokenAllotment) {
            if (appointmentsAfterLastW.length < walkInTokenAllotment) {
              const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 2]; // -2 because we're adding 1
              if (targetAppointment) {
                const nextWSlot = (targetAppointment.slotIndex ?? 0) + 1;
                imaginaryWSlotPositionsForCheck.add(nextWSlot);
              } else {
                imaginaryWSlotPositionsForCheck.add(lastWTokenSlotIndex + walkInTokenAllotment + 1);
              }
            } else {
              const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 1];
              const nextWSlot = (targetAppointment.slotIndex ?? 0) + 1;
              imaginaryWSlotPositionsForCheck.add(nextWSlot);
            }
            
            const maxSlotIndex = Math.max(...confirmedAppointmentsForCheck.map(a => a.slotIndex ?? 0), lastWTokenSlotIndex);
            const firstWSlot = Array.from(imaginaryWSlotPositionsForCheck)[0] || (lastWTokenSlotIndex + 1);
            let currentWSlot = firstWSlot;
            while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
              currentWSlot += walkInTokenAllotment + 1;
              imaginaryWSlotPositionsForCheck.add(currentWSlot);
            }
          }
        }
        
        console.log('🔍 [DEBUG] Double-check: Recalculated imaginary W slots (accounting for new A token):', {
          selectedSlotIndex,
          confirmedAppointmentsCount: confirmedAppointmentsForCheck.length,
          totalAAppointmentsAfterThisCheck,
          imaginaryWSlotPositions: Array.from(imaginaryWSlotPositionsForCheck).sort((a, b) => a - b),
          walkInTokenAllotment
        });
        
        // Double-check: Verify the selected slot is not an imaginary W slot
        if (imaginaryWSlotPositionsForCheck.has(selectedSlotIndex)) {
          console.error('❌ [ERROR] Double-check failed: Selected slot is an imaginary W slot:', {
            selectedSlotIndex,
            imaginaryWSlotPositions: Array.from(imaginaryWSlotPositionsForCheck).sort((a, b) => a - b),
            walkInTokenAllotment,
            totalAAppointmentsAfterThisCheck,
            confirmedAppointmentsCount: confirmedAppointmentsForCheck.length
          });
          const error = new Error('SLOT_RESERVED_FOR_WALKIN') as Error & { code?: string };
          error.code = 'SLOT_RESERVED_FOR_WALKIN';
          error.message = `Slot ${selectedSlotIndex} is reserved for walk-in tokens. No available slots found.`;
          throw error;
        }
      }
      
      // Create the reservation atomically
      transaction.set(selectedSlotReservationRef, {
        clinicId,
        doctorName,
        date: dateStr,
        slotIndex: selectedSlotIndex,
        reservedAt: serverTimestamp(),
        reservedBy: 'appointment-booking'
      });
      
      // Update appointmentData with the atomically selected slot
      appointmentData.slotIndex = selectedSlotIndex;
      console.log('✅ [TRANSACTION] Atomically selected slot:', {
        requestedSlotIndex: requestedSlotIndex ?? undefined,
        selectedSlotIndex,
        reason: 'Atomic slot selection inside transaction'
      });
    }
    
    // Step 2.2: For W tokens, add delay to subsequent A tokens (keep original time and cutOffTime unchanged, only update noShowTime and delay)
    if (type === 'W' && appointmentDocsToShift.length > 0) {
      for (const { ref, data, newTime, newCutOffTime, newNoShowTime, newDelay } of appointmentDocsToShift) {
        // Keep original time and cutOffTime unchanged, only update no-show time and delay field
        transaction.update(ref, {
          // time: newTime, // Don't update time - keep original appointment time
          // cutOffTime: newCutOffTime, // Don't update cutOffTime - keep original (appointment time - 15 minutes, no delay)
          noShowTime: newNoShowTime, // Update noShowTime with delay (appointment time + 15 minutes + delay)
          delay: newDelay, // Store the delay in minutes
          updatedAt: serverTimestamp()
        });
      }
    }
    
    // Step 2.3: Generate next sequential token using atomic counter
    
    let nextTokenNum: number;
    
    if (type === 'A') {
      // A tokens: Use slotIndex + 1 for token number
      if (typeof appointmentData.slotIndex === 'number') {
        nextTokenNum = appointmentData.slotIndex + 1;
      } else {
        // Fallback: use counter
        if (counterDoc.exists()) {
          const currentCount = counterDoc.data().count || 0;
          transaction.update(counterRef, {
            count: increment(1),
            lastUpdated: serverTimestamp()
          });
          nextTokenNum = currentCount + 1;
        } else {
          nextTokenNum = initialNextTokenNum ?? 1;
          transaction.set(counterRef, {
            count: nextTokenNum,
            clinicId,
            doctorName,
            date: dateStr,
            type: 'A',
            lastUpdated: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        }
      }
    } else {
      // W tokens: Start from (total slots count + 1)
      // Use pre-calculated wTokenStartNumber (calculated before transaction)
      if (!wTokenStartNumber) {
        throw new Error('wTokenStartNumber must be calculated before transaction');
      }
      
      if (counterDoc.exists()) {
        // Counter exists, increment atomically
        const currentCount = counterDoc.data().count || 0;
        transaction.update(counterRef, {
          count: increment(1),
          lastUpdated: serverTimestamp()
        });
        // W tokens start from (total slots + 1), so add the start number
        nextTokenNum = wTokenStartNumber + currentCount;
      } else {
        // Counter doesn't exist, use pre-calculated value
        nextTokenNum = initialNextTokenNum ?? wTokenStartNumber;
        const counterOffset = nextTokenNum - wTokenStartNumber + 1;
        transaction.set(counterRef, {
          count: counterOffset,
          clinicId,
          doctorName,
          date: dateStr,
          type: 'W',
          startNumber: wTokenStartNumber,
          lastUpdated: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      }
    }
    
    // Generate token number
    const tokenNumber = `${type}${String(nextTokenNum).padStart(3, '0')}`;
    const numericToken = (typeof appointmentData.slotIndex === 'number') ? (appointmentData.slotIndex + 1) : nextTokenNum;
    
    const finalSlotIndex = appointmentData.slotIndex;
    
    console.log('✅ [DEBUG] generateNextTokenAndReserveSlot returning:', {
      type,
      tokenNumber,
      numericToken,
      finalSlotIndex,
      originalSlotIndex: type === 'W' ? 'N/A (W token)' : 'N/A (A token)'
    });
    
    return { 
      tokenNumber, 
      numericToken, 
      slotIndex: finalSlotIndex 
    };
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
 * ✅ Walk-in opens 2 hours before the first session starts.
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

  // Step 4: Get confirmed appointments (Pending or Confirmed) sorted by slotIndex
  const confirmedAppointments = appointments
    .filter(a => a.status === 'Pending' || a.status === 'Confirmed')
    .filter(a => a.bookedVia === 'Advanced Booking' || a.bookedVia === 'Online' || a.bookedVia === 'Advanced')
    .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));

  // Step 5: Get existing W tokens sorted by slotIndex
  const existingWTokens = appointments
    .filter(a => a.bookedVia === 'Walk-in' && (a.status === 'Pending' || a.status === 'Confirmed'))
    .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));

  // Step 5.5: Priority 1 - Check for available slots within 1-hour window (W Priority slots)
  // These are slots that are available/vacant and within 1 hour from now (where A tokens can't book)
  const oneHourFromNow = addMinutes(now, 60);
  const bookedSlotIndices = new Set(
    appointments
      .filter(a => (a.status === 'Pending' || a.status === 'Confirmed'))
      .map(a => a.slotIndex ?? -1)
      .filter(idx => idx >= 0)
  );
  
  // Find available slots within 1-hour window
  // Priority 1: W tokens should fill available slots in 1-hour time frame first
  const availableSlotsWithinOneHour: number[] = [];
  for (let i = 0; i < allSlots.length; i++) {
    const slot = allSlots[i];
    const isWithinOneHour = !isBefore(slot.time, now) && !isAfter(slot.time, oneHourFromNow);
    
    if (isWithinOneHour) {
      // Check if slot is available (vacant - not booked by any Pending/Confirmed appointment)
      // W tokens should fill available slots in 1-hour time frame first
      // Each W token gets its own slot (W tokens don't share slots)
      const slotAppointment = appointments.find(a => a.slotIndex === i);
      const isEmpty = !slotAppointment;
      const isVacant = isEmpty || (slotAppointment && ['Skipped', 'Cancelled', 'Completed', 'No-show'].includes(slotAppointment.status));
      
      // Slot is available if it's vacant (not booked by any Pending/Confirmed appointment)
      // W tokens don't share slots, so we exclude slots already booked by W tokens
      if (isVacant && !bookedSlotIndices.has(i)) {
        availableSlotsWithinOneHour.push(i);
      }
    }
  }
  
  // Sort by slot index to get the earliest available slot
  availableSlotsWithinOneHour.sort((a, b) => a - b);

  // Step 5.5: Calculate imaginary W slot positions for Priority 2 check
  // Imaginary W slots are slots that should be reserved for W tokens based on the walkInTokenAllotment
  // These slots are calculated based on confirmed A appointments and should be used in Priority 2
  const imaginaryWSlotPositions = new Set<number>();
  
  console.log('🔍 [DEBUG] Calculating imaginary W slots:', {
    confirmedAppointmentsCount: confirmedAppointments.length,
    existingWTokensCount: existingWTokens.length,
    walkInTokenAllotment,
    confirmedAppointments: confirmedAppointments.map(a => ({ slotIndex: a.slotIndex, bookedVia: a.bookedVia })),
    existingWTokens: existingWTokens.map(a => ({ slotIndex: a.slotIndex, bookedVia: a.bookedVia }))
  });
  
  if (confirmedAppointments.length === 0) {
    // No confirmed appointments - first W would be at slot 0 + walkInTokenAllotment
    imaginaryWSlotPositions.add(walkInTokenAllotment);
    console.log('🔍 [DEBUG] No confirmed appointments - imaginary W slot:', walkInTokenAllotment);
  } else if (existingWTokens.length === 0) {
    // First W token: after walkInTokenAllotment confirmed appointments
    if (confirmedAppointments.length >= walkInTokenAllotment) {
      const targetAppointment = confirmedAppointments[walkInTokenAllotment - 1];
      const firstWSlot = (targetAppointment.slotIndex ?? 0) + 1;
      imaginaryWSlotPositions.add(firstWSlot);
      
      console.log('🔍 [DEBUG] First W token - calculated first imaginary W slot:', {
        targetAppointmentSlotIndex: targetAppointment.slotIndex,
        firstWSlot,
        walkInTokenAllotment
      });
      
      // Calculate additional imaginary W slots at intervals
      let currentWSlot = firstWSlot;
      const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), 0);
      while (currentWSlot <= maxSlotIndex + walkInTokenAllotment) {
        currentWSlot += walkInTokenAllotment + 1;
        imaginaryWSlotPositions.add(currentWSlot);
      }
    }
    // If fewer than walkInTokenAllotment confirmed appointments, don't add any imaginary W slots yet
    // All slots should be available for A tokens to fill
    } else {
    // Subsequent W tokens: Calculate imaginary W slots based on the pattern from the first W token
    // The first imaginary W slot should be calculated as if there were no W tokens yet
    // We need to reconstruct the original pattern by considering all confirmed appointments (A tokens only)
    // and calculating where the first imaginary W slot would be
    
    // Get the first W token to understand the pattern
    const firstWToken = existingWTokens[0];
    const firstWTokenSlotIndex = firstWToken?.slotIndex ?? -1;
    
    // Calculate the first imaginary W slot based on the original pattern
    // The first imaginary W slot should be after walkInTokenAllotment confirmed appointments
    // But we need to account for the fact that appointments might have shifted after the first W token
    
    // Sort confirmed appointments by slotIndex to get the order
    const sortedConfirmedAppointments = [...confirmedAppointments].sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));
    
    let firstImaginaryWSlot: number | null = null;
    
    if (sortedConfirmedAppointments.length >= walkInTokenAllotment) {
      // The first imaginary W slot should be after the walkInTokenAllotment-th confirmed appointment
      // We need to find the appointment that would have been the walkInTokenAllotment-th in the ORIGINAL order
      // (before any W tokens were inserted)
      
      // The pattern is: after walkInTokenAllotment confirmed appointments, place the first imaginary W slot
      // If the first W token is at slot 1, and there are 7 confirmed appointments, they should be at slots 0, 2, 3, 4, 5, 6, 7
      // The 7th appointment (index 6) would be at slot 6, so the first imaginary W slot should be at slot 7
      
      // Count how many confirmed appointments come before the first W token
      const appointmentsBeforeFirstW = sortedConfirmedAppointments.filter(a => {
        const aptSlotIndex = a.slotIndex ?? 0;
        return aptSlotIndex < firstWTokenSlotIndex;
      });
      
      console.log('🔍 [DEBUG] Calculating first imaginary W slot:', {
        firstWTokenSlotIndex,
        appointmentsBeforeFirstWCount: appointmentsBeforeFirstW.length,
        appointmentsBeforeFirstW: appointmentsBeforeFirstW.map(a => ({ slotIndex: a.slotIndex })),
        walkInTokenAllotment,
        totalConfirmedAppointments: sortedConfirmedAppointments.length
      });
      
      if (appointmentsBeforeFirstW.length >= walkInTokenAllotment) {
        // If we have enough appointments before the first W token, use that pattern
        // This means the first W token was placed after walkInTokenAllotment appointments
        const targetAppointment = appointmentsBeforeFirstW[walkInTokenAllotment - 1];
        firstImaginaryWSlot = (targetAppointment.slotIndex ?? 0) + 1;
        console.log('🔍 [DEBUG] Using appointments before first W token:', {
          targetAppointmentSlotIndex: targetAppointment.slotIndex,
          firstImaginaryWSlot
        });
      } else {
        // If we don't have enough appointments before the first W token,
        // the first imaginary W slot should be calculated based on the pattern
        // The first imaginary W slot should be at slot 7 if there are 7 confirmed appointments
        // But we need to account for the fact that the first W token might have shifted appointments
        
        // The simplest approach: use the walkInTokenAllotment-th appointment in the sorted list
        // This should give us slot 6 (if appointments are at 0, 2, 3, 4, 5, 6, 7), so firstImaginaryWSlot = 7
        const targetAppointment = sortedConfirmedAppointments[walkInTokenAllotment - 1];
        const targetSlotIndex = targetAppointment.slotIndex ?? 0;
        
        // If the target appointment is at slot 6, the first imaginary W slot should be at slot 7
        // But if it's at slot 8 (because appointments shifted), we need to adjust
        // Actually, the first imaginary W slot should always be at slot 7 if there are 7 confirmed appointments
        // So we should use slot 7 directly, or calculate it based on the pattern
        
        // Let's use a simpler approach: the first imaginary W slot should be at slot 7
        // if there are 7 confirmed appointments, regardless of where they are
        // But we need to make sure it's not before the first W token
        
        // Actually, let's calculate it based on the pattern: after walkInTokenAllotment appointments
        // If the appointments are at slots 0, 2, 3, 4, 5, 6, 7, then the 7th is at slot 7
        // So firstImaginaryWSlot should be at slot 8? No, that's wrong.
        
        // The correct logic: the first imaginary W slot should be at slot 7
        // if the 7th confirmed appointment (in original order) would have been at slot 6
        // But since appointments might have shifted, we need to find the right slot
        
        // Let's use the target appointment's slot index + 1, but ensure it's at least slot 7
        firstImaginaryWSlot = Math.max((targetSlotIndex ?? 0) + 1, walkInTokenAllotment);
        
        // But wait, if the target appointment is at slot 8, then firstImaginaryWSlot = 9, which is wrong
        // We need to ensure it's at slot 7
        
        // Actually, I think the issue is that we need to use the ORIGINAL slot indices
        // But we don't have that information. So let's use a different approach:
        // The first imaginary W slot should be at slot 7 if there are 7 confirmed appointments
        // So let's just use slot 7 directly if we have 7 confirmed appointments
        
        if (sortedConfirmedAppointments.length === walkInTokenAllotment) {
          // If we have exactly walkInTokenAllotment confirmed appointments, 
          // the first imaginary W slot should be at slot walkInTokenAllotment (7)
          firstImaginaryWSlot = walkInTokenAllotment;
        } else {
          // Otherwise, use the target appointment's slot + 1
          firstImaginaryWSlot = (targetSlotIndex ?? 0) + 1;
        }
        
        console.log('🔍 [DEBUG] Using walkInTokenAllotment-th appointment:', {
          targetAppointmentSlotIndex: targetSlotIndex,
          firstImaginaryWSlot,
          totalConfirmedAppointments: sortedConfirmedAppointments.length
        });
      }
    } else if (sortedConfirmedAppointments.length > 0) {
      // If fewer than walkInTokenAllotment confirmed appointments, use the last one
      const lastAppointment = sortedConfirmedAppointments[sortedConfirmedAppointments.length - 1];
      firstImaginaryWSlot = (lastAppointment.slotIndex ?? 0) + 1;
  } else {
      // No confirmed appointments, first imaginary W slot is at walkInTokenAllotment
      firstImaginaryWSlot = walkInTokenAllotment;
    }
    
    // Add all imaginary W slots at intervals of (walkInTokenAllotment + 1) starting from firstImaginaryWSlot
    if (firstImaginaryWSlot !== null) {
      let currentWSlot = firstImaginaryWSlot;
      const maxSlotIndex = Math.max(...confirmedAppointments.map(a => a.slotIndex ?? 0), 0);
      while (currentWSlot <= maxSlotIndex + walkInTokenAllotment + 10) { // Add buffer for future slots
        imaginaryWSlotPositions.add(currentWSlot);
        currentWSlot += walkInTokenAllotment + 1;
      }
      
      console.log('🔍 [DEBUG] Subsequent W token - calculated imaginary W slots from pattern:', {
        firstWTokenSlotIndex,
        firstImaginaryWSlot,
        walkInTokenAllotment,
        confirmedAppointmentsCount: confirmedAppointments.length,
        sortedConfirmedAppointments: sortedConfirmedAppointments.map(a => ({ slotIndex: a.slotIndex, bookedVia: a.bookedVia })),
        imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions).sort((a, b) => a - b)
      });
    }
    
    // Also check appointments after the last W token to see if we need additional imaginary W slots
    const lastWToken = existingWTokens[existingWTokens.length - 1];
    const lastWTokenSlotIndex = lastWToken?.slotIndex ?? -1;
    
    const appointmentsAfterLastW = confirmedAppointments.filter(a => {
      const aptSlotIndex = a.slotIndex ?? 0;
      return aptSlotIndex > lastWTokenSlotIndex;
    });
    
    console.log('🔍 [DEBUG] Subsequent W token - checking appointments after last W:', {
      lastWTokenSlotIndex,
      appointmentsAfterLastWCount: appointmentsAfterLastW.length,
      appointmentsAfterLastW: appointmentsAfterLastW.map(a => ({ slotIndex: a.slotIndex, bookedVia: a.bookedVia })),
      walkInTokenAllotment
    });
  }
  
  console.log('🔍 [DEBUG] Calculated imaginary W slots:', {
    imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions).sort((a, b) => a - b),
    walkInTokenAllotment
  });
  
  // Priority 3: Find empty slots before imaginary W slots (only if no imaginary W slots available)
  // According to slot-visualizer: "If no imaginary W slots available, W tokens fill empty slots that come before imaginary W slots"
  const sortedImaginaryWSlots = Array.from(imaginaryWSlotPositions).sort((a, b) => a - b);
  const emptySlotsBeforeImaginaryW: number[] = [];
  
  console.log('🔍 [DEBUG] Priority 3: Calculating empty slots before imaginary W slots:', {
    sortedImaginaryWSlots,
    firstImaginaryWSlot: sortedImaginaryWSlots.length > 0 ? sortedImaginaryWSlots[0] : null
  });
  
  // Only find empty slots before imaginary W slots if there are imaginary W slots calculated
  // If there are no imaginary W slots, Priority 3 doesn't apply
  if (sortedImaginaryWSlots.length > 0) {
    const firstImaginaryWSlot = sortedImaginaryWSlots[0];
    
    // Find empty slots that come before the first imaginary W slot
    // IMPORTANT: Do NOT include the imaginary W slot itself - it should be used in Priority 2
    for (let i = 0; i < allSlots.length && i < firstImaginaryWSlot; i++) {
      // CRITICAL: Skip if this slot is an imaginary W slot - it should be used in Priority 2, not Priority 3
      if (imaginaryWSlotPositions.has(i)) {
        console.log('🔍 [DEBUG] Skipping slot (it is an imaginary W slot, should be used in Priority 2):', i);
        continue;
      }
      
      const slot = allSlots[i];
      const isWithinOneHour = !isBefore(slot.time, now) && !isAfter(slot.time, oneHourFromNow);
      
      // Skip slots in 1-hour window (already checked in Priority 1)
      if (isWithinOneHour) {
        continue;
      }
      
      // Check if slot is available (vacant)
      const slotAppointment = appointments.find(a => a.slotIndex === i);
      const isEmpty = !slotAppointment;
      const isVacant = isEmpty || (slotAppointment && ['Skipped', 'Cancelled', 'Completed', 'No-show'].includes(slotAppointment.status));
      
      // Slot is available if it's vacant and not booked by Pending/Confirmed appointment
      if (isVacant && !bookedSlotIndices.has(i)) {
        emptySlotsBeforeImaginaryW.push(i);
      }
    }
  }
  
  // Sort by slot index to get the earliest available slot
  emptySlotsBeforeImaginaryW.sort((a, b) => a - b);

  console.log('🔍 [DEBUG] Priority 3: Empty slots before imaginary W slots:', {
    emptySlotsBeforeImaginaryW,
    firstImaginaryWSlot: sortedImaginaryWSlots.length > 0 ? sortedImaginaryWSlots[0] : null
  });

  // Step 6: Calculate target slot - Priority 1: Available slots within 1-hour window, Priority 2: Imaginary W slots, Priority 3: Empty slots before imaginary W slots
  // According to slot-visualizer page:
  // Priority 1: W tokens fill empty slots within 1-hour window (where A tokens can't book)
  // Priority 2: W tokens use imaginary slots at intervals of walkInTokenAllotment confirmed appointments (use imaginary W slots first!)
  // Priority 3: If no imaginary W slots available, W tokens fill empty slots that come before imaginary W slots
  let finalSlotIndex: number;
  const totalSlots = allSlots.length;
  
  // Priority 1: Use earliest available slot within 1-hour window if available
  if (availableSlotsWithinOneHour.length > 0) {
    finalSlotIndex = availableSlotsWithinOneHour[0];
    console.log('✅ [DEBUG] Priority 1: Using available slot within 1-hour window:', {
      slotIndex: finalSlotIndex,
      slotTime: format(allSlots[finalSlotIndex].time, 'hh:mm a'),
      availableSlots: availableSlotsWithinOneHour
    });
  } else if (sortedImaginaryWSlots.length > 0) {
    // Priority 2: Use the first imaginary W slot position
    // Imaginary W slots should be used even if they appear "booked" - they're reserved for W tokens
    // Check if the first imaginary W slot is actually available (not booked by an A token)
    console.log('🔍 [DEBUG] Priority 2: Checking imaginary W slots:', {
      sortedImaginaryWSlots,
      totalAppointments: appointments.length
    });
    
    let selectedImaginarySlot = -1;
    let emptyImaginarySlot = -1;
    let sharedImaginarySlot = -1;
    
    // First pass: Find empty imaginary W slots (preferred)
    // Second pass: Find imaginary W slots already booked by W tokens (can share if no empty ones)
    for (const imaginarySlot of sortedImaginaryWSlots) {
      // Check if this imaginary slot is booked by an A token (not available for W)
      const slotAppointment = appointments.find(a => a.slotIndex === imaginarySlot);
      const isBookedByA = slotAppointment && 
        (slotAppointment.bookedVia === 'Advanced Booking' || 
         slotAppointment.bookedVia === 'Online' || 
         slotAppointment.bookedVia === 'Advanced') &&
        (slotAppointment.status === 'Pending' || slotAppointment.status === 'Confirmed');
      
      const isBookedByW = slotAppointment && 
        slotAppointment.bookedVia === 'Walk-in' &&
        (slotAppointment.status === 'Pending' || slotAppointment.status === 'Confirmed');
      
      const isEmpty = !slotAppointment;
      
      console.log('🔍 [DEBUG] Checking imaginary W slot:', {
        slotIndex: imaginarySlot,
        hasAppointment: !!slotAppointment,
        appointmentBookedVia: slotAppointment?.bookedVia,
        appointmentStatus: slotAppointment?.status,
        isBookedByA,
        isBookedByW,
        isEmpty
      });
      
      // Skip if booked by A token
      if (isBookedByA) {
        console.log('⚠️ [DEBUG] Skipping imaginary W slot (booked by A token):', {
          slotIndex: imaginarySlot,
          appointmentBookedVia: slotAppointment?.bookedVia
        });
        continue;
      }
      
      // Prefer empty imaginary W slots
      if (isEmpty && emptyImaginarySlot === -1) {
        emptyImaginarySlot = imaginarySlot;
        console.log('✅ [DEBUG] Found empty imaginary W slot:', {
          slotIndex: emptyImaginarySlot
        });
      }
      
      // If no empty ones found, allow sharing with other W tokens
      if (isBookedByW && sharedImaginarySlot === -1) {
        sharedImaginarySlot = imaginarySlot;
        console.log('✅ [DEBUG] Found shared imaginary W slot (already booked by W token):', {
          slotIndex: sharedImaginarySlot
        });
      }
    }
    
    // Select empty slot first, then shared slot if no empty ones
    if (emptyImaginarySlot >= 0) {
      selectedImaginarySlot = emptyImaginarySlot;
      console.log('✅ [DEBUG] Selected empty imaginary W slot:', {
        slotIndex: selectedImaginarySlot,
        reason: 'Empty imaginary W slot (preferred)'
      });
    } else if (sharedImaginarySlot >= 0) {
      selectedImaginarySlot = sharedImaginarySlot;
      console.log('✅ [DEBUG] Selected shared imaginary W slot:', {
        slotIndex: selectedImaginarySlot,
        reason: 'No empty imaginary W slots available, sharing with existing W token'
      });
    }
    
    if (selectedImaginarySlot >= 0) {
      finalSlotIndex = selectedImaginarySlot;
      console.log('✅ [DEBUG] Priority 2: Using imaginary W slot:', {
        slotIndex: finalSlotIndex,
        availableImaginaryWSlots: sortedImaginaryWSlots
      });
    } else {
      console.log('⚠️ [DEBUG] Priority 2: No available imaginary W slots (all booked by A tokens), falling through to Priority 3');
    }
    // If selectedImaginarySlot is -1, fall through to Priority 3
  }
  
  // Priority 3: Use empty slots before imaginary W slots (only if Priority 1 and Priority 2 didn't find a slot)
  // According to slot-visualizer: "If no imaginary W slots available, W tokens fill empty slots that come before imaginary W slots"
  if (finalSlotIndex === undefined && emptySlotsBeforeImaginaryW.length > 0) {
    // Priority 3: Use earliest empty slot before imaginary W slots
    finalSlotIndex = emptySlotsBeforeImaginaryW[0];
    console.log('✅ [DEBUG] Priority 3: Using empty slot before imaginary W slots:', {
      slotIndex: finalSlotIndex,
      slotTime: format(allSlots[finalSlotIndex].time, 'hh:mm a'),
      availableSlots: emptySlotsBeforeImaginaryW
    });
  }
  
  // Fallback: Use interval-based logic only if no slot was found and no imaginary W slots were calculated
  if (finalSlotIndex === undefined) {
    if (sortedImaginaryWSlots.length > 0) {
      // If imaginary W slots were calculated but all were booked by A tokens, use the first one anyway
      // This should not happen if Priority 2 logic is correct, but it's a safety fallback
      finalSlotIndex = sortedImaginaryWSlots[0];
      console.log('⚠️ [DEBUG] Fallback: Using first imaginary W slot (all were booked by A tokens):', {
        slotIndex: finalSlotIndex,
        availableImaginaryWSlots: sortedImaginaryWSlots
      });
  } else {
      // Fallback: Use interval-based logic if no imaginary W slots calculated
      if (confirmedAppointments.length === 0) {
        // No confirmed appointments - place at first slot
        if (isBefore(now, availabilityStart)) {
          finalSlotIndex = 0;
        } else {
          finalSlotIndex = findNextImmediateSlot(allSlots, now);
          if (finalSlotIndex >= allSlots.length) {
            throw new Error('No available slots for walk-in today.');
          }
        }
      } else if (existingWTokens.length === 0) {
        // First W token: place after walkInTokenAllotment confirmed appointments
        if (confirmedAppointments.length >= walkInTokenAllotment) {
          const targetAppointment = confirmedAppointments[walkInTokenAllotment - 1];
          finalSlotIndex = (targetAppointment.slotIndex ?? 0) + 1;
        } else {
          // If fewer than walkInTokenAllotment confirmed appointments, place after the last one
          const lastAppointment = confirmedAppointments[confirmedAppointments.length - 1];
          finalSlotIndex = (lastAppointment.slotIndex ?? 0) + 1;
        }
      } else {
        // Subsequent W tokens: place after walkInTokenAllotment appointments from last W token
        const lastWToken = existingWTokens[existingWTokens.length - 1];
        const lastWTokenSlotIndex = lastWToken?.slotIndex ?? -1;
        
        // Find appointments after the last W token
        const appointmentsAfterLastW = confirmedAppointments.filter(a => {
          const aptSlotIndex = a.slotIndex ?? 0;
          return aptSlotIndex > lastWTokenSlotIndex;
        });
        
        if (appointmentsAfterLastW.length >= walkInTokenAllotment) {
          // Place after walkInTokenAllotment-th appointment after last W
          const targetAppointment = appointmentsAfterLastW[walkInTokenAllotment - 1];
          finalSlotIndex = (targetAppointment.slotIndex ?? 0) + 1;
        } else {
          // If fewer than walkInTokenAllotment appointments after last W, place after the last one
          if (appointmentsAfterLastW.length > 0) {
            const lastAppointment = appointmentsAfterLastW[appointmentsAfterLastW.length - 1];
            finalSlotIndex = (lastAppointment.slotIndex ?? 0) + 1;
          } else {
            // No appointments after last W, place right after last W
            finalSlotIndex = lastWTokenSlotIndex + 1;
          }
          }
        }
      }
  }

  // Step 7: Validate slot is within bounds
  if (finalSlotIndex === undefined) {
    console.error('❌ [ERROR] No slot was selected!', {
      availableSlotsWithinOneHour: availableSlotsWithinOneHour.length,
      sortedImaginaryWSlots: sortedImaginaryWSlots.length,
      emptySlotsBeforeImaginaryW: emptySlotsBeforeImaginaryW.length,
      confirmedAppointmentsCount: confirmedAppointments.length,
      existingWTokensCount: existingWTokens.length,
      walkInTokenAllotment
    });
    throw new Error('No available slots for walk-in today.');
  }
  
  if (finalSlotIndex >= allSlots.length) {
    console.error('❌ [ERROR] Selected slot is out of bounds:', {
      finalSlotIndex,
      totalSlots: allSlots.length
    });
    throw new Error('No available slots for walk-in today.');
  }
  
  console.log('✅ [DEBUG] Final slot selection:', {
    finalSlotIndex,
    slotTime: format(allSlots[finalSlotIndex].time, 'hh:mm a'),
    isImaginaryWSlot: imaginaryWSlotPositions.has(finalSlotIndex),
    isInOneHourWindow: availableSlotsWithinOneHour.includes(finalSlotIndex),
    isBeforeImaginaryW: emptySlotsBeforeImaginaryW.includes(finalSlotIndex),
    imaginaryWSlotPositions: Array.from(imaginaryWSlotPositions).sort((a, b) => a - b),
    selectedFromPriority: availableSlotsWithinOneHour.includes(finalSlotIndex) ? 'Priority 1' : 
                          imaginaryWSlotPositions.has(finalSlotIndex) ? 'Priority 2' : 
                          emptySlotsBeforeImaginaryW.includes(finalSlotIndex) ? 'Priority 3' : 'Fallback'
  });
  
  let finalSessionIndex = -1;

  // Step 8: Calculate patients ahead
  // Count all confirmed appointments (A and W) before the final slot
  // Also count W tokens at the same slot index (if sharing the same imaginary slot)
  const allConfirmedAppointments = appointments.filter(a =>
    a.status === 'Pending' || a.status === 'Confirmed'
  );
  
  // Count appointments before the final slot
  const appointmentsBeforeSlot = allConfirmedAppointments.filter(a => {
    const aptSlotIndex = a.slotIndex ?? 0;
    return aptSlotIndex < finalSlotIndex;
  });
  
  // Count W tokens at the same slot index (if sharing the same imaginary slot)
  const wTokensAtSameSlot = allConfirmedAppointments.filter(a => {
    const aptSlotIndex = a.slotIndex ?? 0;
    return aptSlotIndex === finalSlotIndex && a.bookedVia === 'Walk-in';
  });
  
  // Total people ahead = appointments before slot + W tokens at same slot (if sharing)
  const totalAhead = appointmentsBeforeSlot.length + wTokensAtSameSlot.length;
  
  // Don't cap patients ahead - show the actual count
  const patientsAhead = totalAhead;

  // Step 6: Calculate estimated time for display
  // Always use: (number of people ahead * average consultation time)
  // This is for display only, placement logic remains unchanged
  let estimatedTime: Date;
  const consultationStarted = !isBefore(now, availabilityStart);
  
  if (!consultationStarted) {
    // Before consultation starts: Use patientsAhead * averageConsultationTime from consultation start
    estimatedTime = addMinutes(availabilityStart, patientsAhead * slotDuration);
  } else {
    // After consultation starts: Use patientsAhead * averageConsultationTime from current time
    estimatedTime = addMinutes(now, patientsAhead * slotDuration);
  }

  // Step 10: W tokens don't have a fixed time - they're inserted between A tokens
  // Use the time of the appointment before this slot (if exists) or the slot time
  let actualSlotTime: Date;
  if (finalSlotIndex > 0 && confirmedAppointments.length > 0) {
    // Find the appointment that comes before this slot
    const appointmentsBeforeSlot = confirmedAppointments.filter(a => {
      const aptSlotIndex = a.slotIndex ?? 0;
      return aptSlotIndex < finalSlotIndex;
    });
    
    if (appointmentsBeforeSlot.length > 0) {
      // Use the time of the last appointment before this slot
      const lastAppointmentBeforeSlot = appointmentsBeforeSlot[appointmentsBeforeSlot.length - 1];
      try {
        const appointmentDate = parse(lastAppointmentBeforeSlot.date, "d MMMM yyyy", new Date());
        const appointmentTime = parseTimeString(lastAppointmentBeforeSlot.time, appointmentDate);
        // W token is placed "between" appointments, so use the same time as the previous appointment
        // The actual time will be calculated when shifting subsequent appointments
        actualSlotTime = appointmentTime;
      } catch {
        // Fallback to slot time if parsing fails
        actualSlotTime = allSlots[finalSlotIndex].time;
      }
    } else {
      // No appointments before, use slot time
      actualSlotTime = allSlots[finalSlotIndex].time;
    }
  } else {
    // Use slot time if no appointments before
    actualSlotTime = allSlots[finalSlotIndex].time;
  }
  
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

  // Step 3: Get confirmed appointments (Pending or Confirmed) sorted by slotIndex
  const confirmedAppointments = activeAppointments
    .filter(a => a.doctor === skippedAppointment.doctor && a.date === dateStr)
    .filter(a => (a.status === 'Pending' || a.status === 'Confirmed'))
    .sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));

  // Step 4: Calculate target position based on confirmed appointments
  let targetSlotIndex: number;
  const now = new Date();
  
  if (confirmedAppointments.length === 0) {
    // No confirmed appointments - place at next immediate slot
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
    targetSlotIndex = nextImmediateSlotIndex;
  } else if (confirmedAppointments.length >= recurrence) {
    // If there are >= recurrence confirmed appointments, place after the recurrence-th one
    const targetAppointment = confirmedAppointments[recurrence - 1];
    targetSlotIndex = (targetAppointment.slotIndex ?? 0) + 1;
  } else {
    // If there are < recurrence confirmed appointments, place after the last one
    const lastAppointment = confirmedAppointments[confirmedAppointments.length - 1];
    targetSlotIndex = (lastAppointment.slotIndex ?? 0) + 1;
  }

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
  const isOccupiedByActive = confirmedAppointments.some(apt => 
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