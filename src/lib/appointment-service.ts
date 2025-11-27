import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
  type Transaction,
} from 'firebase/firestore';
import { format, addMinutes, differenceInMinutes, isAfter, isBefore, parse } from 'date-fns';
import type { Doctor, Appointment } from '@/lib/types';
import { computeWalkInSchedule, type SchedulerAssignment } from '@/lib/walk-in-scheduler';
import { parseTime as parseTimeString } from '@/lib/utils';

const ACTIVE_STATUSES = new Set(['Pending', 'Confirmed', 'Skipped', 'Completed']);
const MAX_TRANSACTION_ATTEMPTS = 5;
const RESERVATION_CONFLICT_CODE = 'slot-reservation-conflict';

function isReservationConflict(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Check for custom reservation conflict code
  if (
    error.message === RESERVATION_CONFLICT_CODE ||
    (typeof (error as { code?: string }).code === 'string' &&
      (error as { code?: string }).code === RESERVATION_CONFLICT_CODE)
  ) {
    return true;
  }

  // Firestore transaction conflicts occur when multiple transactions try to modify the same document
  // These typically have code 'failed-precondition' or 'aborted'
  const firestoreError = error as { code?: string; message?: string };
  if (typeof firestoreError.code === 'string') {
    return (
      firestoreError.code === 'failed-precondition' ||
      firestoreError.code === 'aborted' ||
      firestoreError.code === 'already-exists' ||
      (firestoreError.message?.includes('transaction') ?? false)
    );
  }

  return false;
}
interface DailySlot {
  index: number;
  time: Date;
  sessionIndex: number;
}

interface LoadedDoctor {
  doctor: Doctor;
  slots: DailySlot[];
}

async function loadDoctorAndSlots(
  clinicId: string,
  doctorName: string,
  date: Date,
  doctorId?: string
): Promise<LoadedDoctor> {
  let doctor: Doctor | null = null;

  if (doctorId) {
    const doctorRef = doc(db, 'doctors', doctorId);
    const doctorSnap = await getDoc(doctorRef);
    if (doctorSnap.exists()) {
      doctor = { id: doctorSnap.id, ...doctorSnap.data() } as Doctor;
    }
  }

  if (!doctor) {
  const doctorsRef = collection(db, 'doctors');
    const doctorQuery = query(
    doctorsRef,
    where('clinicId', '==', clinicId),
    where('name', '==', doctorName)
  );
    const doctorSnapshot = await getDocs(doctorQuery);
    
    if (!doctorSnapshot.empty) {
      const doctorDoc = doctorSnapshot.docs[0];
      doctor = { id: doctorDoc.id, ...doctorDoc.data() } as Doctor;
    }
  }

  if (!doctor) {
    throw new Error('Doctor not found.');
  }

  if (!doctor.availabilitySlots || doctor.availabilitySlots.length === 0) {
    throw new Error('Doctor availability information is missing.');
  }

  const dayOfWeek = format(date, 'EEEE');
  const availabilityForDay = doctor.availabilitySlots.find(slot => slot.day === dayOfWeek);

  if (!availabilityForDay || !availabilityForDay.timeSlots?.length) {
    throw new Error('Doctor is not available on the selected date.');
  }

  const slotDuration = doctor.averageConsultingTime || 15;
  const slots: DailySlot[] = [];
  let slotIndex = 0;

  availabilityForDay.timeSlots.forEach((session, sessionIndex) => {
    let currentTime = parseTimeString(session.from, date);
    const endTime = parseTimeString(session.to, date);

    while (isBefore(currentTime, endTime)) {
      slots.push({ index: slotIndex, time: new Date(currentTime), sessionIndex });
      currentTime = addMinutes(currentTime, slotDuration);
      slotIndex += 1;
    }
  });

  if (slots.length === 0) {
    throw new Error('No slots could be generated for the selected date.');
  }

  return { doctor, slots };
}

async function fetchDayAppointments(
  clinicId: string,
  doctorName: string,
  date: Date
): Promise<Appointment[]> {
  const dateStr = format(date, 'd MMMM yyyy');
        const appointmentsRef = collection(db, 'appointments');
      const appointmentsQuery = query(
          appointmentsRef,
          where('clinicId', '==', clinicId),
          where('doctor', '==', doctorName),
          where('date', '==', dateStr)
        );
  const snapshot = await getDocs(appointmentsQuery);
  return snapshot.docs.map(docRef => ({ id: docRef.id, ...docRef.data() } as Appointment));
}

function buildOccupiedSlotSet(appointments: Appointment[]): Set<number> {
  const occupied = new Set<number>();

  appointments.forEach(appointment => {
    const slotIndex = appointment.slotIndex;
    if (typeof slotIndex === 'number' && ACTIVE_STATUSES.has(appointment.status)) {
      occupied.add(slotIndex);
    }
  });

  return occupied;
}

function getSlotTime(slots: DailySlot[], slotIndex: number): Date {
  const slot = slots[slotIndex];
  if (!slot) {
    throw new Error('Selected slot is outside the doctor availability.');
  }
  return slot.time;
}

/**
 * Calculate reserved walk-in slots per session (15% of FUTURE slots only in each session)
 * This dynamically adjusts as time passes - reserved slots are recalculated based on remaining future slots
 * Returns a Set of slot indices that are reserved for walk-ins
 */
function calculatePerSessionReservedSlots(slots: DailySlot[], now: Date = new Date()): Set<number> {
  const reservedSlots = new Set<number>();
  
  // Group slots by sessionIndex
  const slotsBySession = new Map<number, DailySlot[]>();
  slots.forEach(slot => {
    const sessionSlots = slotsBySession.get(slot.sessionIndex) || [];
    sessionSlots.push(slot);
    slotsBySession.set(slot.sessionIndex, sessionSlots);
  });
  
  // For each session, calculate 15% reserve (last 15% of FUTURE slots in that session)
  slotsBySession.forEach((sessionSlots, sessionIndex) => {
    // Sort slots by index to ensure correct order
    sessionSlots.sort((a, b) => a.index - b.index);
    
    // Filter to only future slots (including current time)
    const futureSlots = sessionSlots.filter(slot => 
      isAfter(slot.time, now) || slot.time.getTime() >= now.getTime()
    );
    
    if (futureSlots.length === 0) {
      return; // No future slots, no reserved slots
    }
    
    const futureSlotCount = futureSlots.length;
    const minimumWalkInReserve = Math.ceil(futureSlotCount * 0.15);
    const reservedWSlotsStart = futureSlotCount - minimumWalkInReserve;
    
    // Mark the last 15% of FUTURE slots in this session as reserved
    for (let i = reservedWSlotsStart; i < futureSlotCount; i++) {
      reservedSlots.add(futureSlots[i].index);
    }
  });
  
  return reservedSlots;
}

type CandidateOptions = {
  appointments?: Appointment[];
  walkInSpacing?: number;
};

function buildCandidateSlots(
  type: 'A' | 'W',
  slots: DailySlot[],
  now: Date,
  occupied: Set<number>,
  preferredSlotIndex?: number,
  options: CandidateOptions = {}
): number[] {
  const oneHourFromNow = addMinutes(now, 60);
  const candidates: number[] = [];
  
  // Calculate reserved walk-in slots per session (15% of FUTURE slots only in each session)
  const reservedWSlots = calculatePerSessionReservedSlots(slots, now);

  const addCandidate = (slotIndex: number) => {
    if (
      slotIndex >= 0 &&
      slotIndex < slots.length &&
      !occupied.has(slotIndex) &&
      !candidates.includes(slotIndex)
    ) {
      // CRITICAL: For advance bookings, NEVER allow slots reserved for walk-ins (last 15% of each session)
      if (type === 'A' && reservedWSlots.has(slotIndex)) {
        const slot = slots[slotIndex];
        console.log(`[SLOT FILTER] Rejecting slot ${slotIndex} - reserved for walk-ins in session ${slot?.sessionIndex}`);
        return; // Skip reserved walk-in slots
      }
      candidates.push(slotIndex);
    }
  };

  if (type === 'A') {
    if (typeof preferredSlotIndex === 'number') {
      const slotTime = getSlotTime(slots, preferredSlotIndex);
      const preferredSlot = slots[preferredSlotIndex];
      const preferredSessionIndex = preferredSlot?.sessionIndex;
      
      // CRITICAL: Also check if preferred slot is not reserved for walk-ins
      // This prevents booking cancelled slots that are in the reserved walk-in range (last 15% of session)
      if (reservedWSlots.has(preferredSlotIndex)) {
        console.log(`[SLOT FILTER] Rejecting preferred slot ${preferredSlotIndex} - reserved for walk-ins in session ${preferredSessionIndex}`);
      } else if (isAfter(slotTime, oneHourFromNow)) {
        addCandidate(preferredSlotIndex);
      } else {
        console.log(`[SLOT FILTER] Rejecting preferred slot ${preferredSlotIndex} - within 1 hour from now`);
    }

      // CRITICAL: If preferred slot is not available, only look for alternatives within the SAME session
      // This ensures bookings stay within the same sessionIndex and don't cross session boundaries
      if (candidates.length === 0 && typeof preferredSessionIndex === 'number') {
    slots.forEach(slot => {
          // Only consider slots in the same session as the preferred slot
          if (
            slot.sessionIndex === preferredSessionIndex &&
            isAfter(slot.time, oneHourFromNow) &&
            !reservedWSlots.has(slot.index)
          ) {
        addCandidate(slot.index);
      }
    });
      }
    } else {
      // No preferred slot - look across all sessions
      slots.forEach(slot => {
        // CRITICAL: Only add slots that are after 1 hour AND not reserved for walk-ins (per session)
        if (isAfter(slot.time, oneHourFromNow) && !reservedWSlots.has(slot.index)) {
          addCandidate(slot.index);
        }
      });
    }
    } else {
    const activeAppointments =
      options.appointments
        ?.filter(
          appointment =>
            typeof appointment.slotIndex === 'number' && ACTIVE_STATUSES.has(appointment.status),
        )
        .sort((a, b) => (a.slotIndex! < b.slotIndex! ? -1 : 1)) ?? [];

    const walkInSpacing =
      typeof options.walkInSpacing === 'number' && options.walkInSpacing > 0
        ? options.walkInSpacing
        : Number.POSITIVE_INFINITY;

    const getATokens = (filterFn?: (appointment: Appointment) => boolean) =>
      activeAppointments.filter(
        appointment =>
          appointment.bookedVia !== 'Walk-in' &&
          (typeof appointment.slotIndex === 'number') &&
          (!filterFn || filterFn(appointment)),
      );

    const getSlotIndexAfterNthA = (afterSlotIndex: number, nth: number): number => {
      let count = 0;
      for (const appointment of activeAppointments) {
        if (appointment.bookedVia === 'Walk-in') continue;
        const slotIndex = appointment.slotIndex!;
        if (slotIndex > afterSlotIndex) {
          count += 1;
          if (count === nth) {
            return slotIndex;
          }
        }
      }
      return -1;
    };

    slots.forEach(slot => {
      if (!isBefore(slot.time, now) && !isAfter(slot.time, oneHourFromNow)) {
        addCandidate(slot.index);
      }
    });

    if (candidates.length > 0) {
      return candidates;
    }

    const availableAfterHour = slots.filter(
      slot => isAfter(slot.time, oneHourFromNow) && !occupied.has(slot.index),
    );

    if (availableAfterHour.length === 0) {
      return candidates;
    }

    if (walkInSpacing === Number.POSITIVE_INFINITY || activeAppointments.length === 0) {
      availableAfterHour.forEach(slot => addCandidate(slot.index));
      return candidates;
    }

    const walkInAppointments = activeAppointments.filter(appointment => appointment.bookedVia === 'Walk-in');
    const lastWalkInSlotIndex =
      walkInAppointments.length > 0
        ? Math.max(...walkInAppointments.map(appointment => appointment.slotIndex!))
        : null;

    let minSlotIndex = -1;

    if (lastWalkInSlotIndex === null) {
      const aTokens = getATokens();
      if (aTokens.length > walkInSpacing) {
        const slotAfterNth = getSlotIndexAfterNthA(-1, walkInSpacing);
        minSlotIndex =
          slotAfterNth >= 0 ? slotAfterNth : aTokens[aTokens.length - 1]?.slotIndex ?? -1;
            } else {
        minSlotIndex = aTokens[aTokens.length - 1]?.slotIndex ?? -1;
      }
    } else {
      const aTokensAfterLastWalkIn = getATokens(appointment => appointment.slotIndex! > lastWalkInSlotIndex);
      if (aTokensAfterLastWalkIn.length > walkInSpacing) {
        const slotAfterNth = getSlotIndexAfterNthA(lastWalkInSlotIndex, walkInSpacing);
        if (slotAfterNth >= 0) {
          minSlotIndex = slotAfterNth;
        } else {
          const allATokens = getATokens();
          minSlotIndex = allATokens[allATokens.length - 1]?.slotIndex ?? lastWalkInSlotIndex;
        }
      } else {
        const allATokens = getATokens();
        const lastASlotIndex = allATokens[allATokens.length - 1]?.slotIndex ?? lastWalkInSlotIndex;
        minSlotIndex = Math.max(lastWalkInSlotIndex, lastASlotIndex);
      }
    }

    const filteredAfterHour = availableAfterHour.filter(slot => slot.index > minSlotIndex);

    if (filteredAfterHour.length === 0) {
      availableAfterHour.forEach(slot => addCandidate(slot.index));
      } else {
      filteredAfterHour.forEach(slot => addCandidate(slot.index));
    }
  }

  return candidates;
}

interface TokenCounterState {
  nextNumber: number;
  exists: boolean;
}

async function prepareNextTokenNumber(
  transaction: Transaction,
  counterRef: DocumentReference
): Promise<TokenCounterState> {
  const counterDoc = await transaction.get(counterRef);

  if (counterDoc.exists()) {
    const currentCount = counterDoc.data()?.count || 0;
    return {
      nextNumber: currentCount + 1,
      exists: true,
    };
  }

  return { nextNumber: 1, exists: false };
}

function commitNextTokenNumber(
  transaction: Transaction,
  counterRef: DocumentReference,
  state: TokenCounterState
): void {
  if (state.exists) {
    transaction.update(counterRef, {
      count: state.nextNumber,
      lastUpdated: serverTimestamp(),
    });
    return;
  }

  transaction.set(counterRef, {
    count: state.nextNumber,
    lastUpdated: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

function buildReservationDocId(
  clinicId: string,
  doctorName: string,
  dateStr: string,
  slotIndex: number
): string {
  return `${clinicId}_${doctorName}_${dateStr}_slot_${slotIndex}`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
}

export async function generateNextToken(
  clinicId: string,
  doctorName: string,
  date: Date,
  type: 'A' | 'W'
): Promise<string> {
  const dateStr = format(date, 'd MMMM yyyy');
  const counterDocId = `${clinicId}_${doctorName}_${dateStr}${type === 'W' ? '_W' : ''}`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
  const counterRef = doc(db, 'token-counters', counterDocId);

  const tokenNumber = await runTransaction(db, async transaction => {
    const counterState = await prepareNextTokenNumber(transaction, counterRef);
    commitNextTokenNumber(transaction, counterRef, counterState);
    return `${type}${String(counterState.nextNumber).padStart(3, '0')}`;
  });

  return tokenNumber;
}

export async function generateNextTokenAndReserveSlot(
  clinicId: string,
  doctorName: string,
  date: Date,
  type: 'A' | 'W',
  appointmentData: {
    time?: string;
    slotIndex?: number;
    doctorId?: string;
    [key: string]: unknown;
    existingAppointmentId?: string;
  }
): Promise<{
  tokenNumber: string;
  numericToken: number;
  slotIndex: number;
  sessionIndex: number;
  time: string;
  reservationId: string;
}>
{
  const dateStr = format(date, 'd MMMM yyyy');
      const now = new Date();
  const counterDocId = `${clinicId}_${doctorName}_${dateStr}${type === 'W' ? '_W' : ''}`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
  const counterRef = doc(db, 'token-counters', counterDocId);

  let walkInSpacingValue = 0;
  if (type === 'W') {
    const clinicSnap = await getDoc(doc(db, 'clinics', clinicId));
    const rawSpacing = clinicSnap.exists() ? Number(clinicSnap.data()?.walkInTokenAllotment ?? 0) : 0;
    walkInSpacingValue = Number.isFinite(rawSpacing) && rawSpacing > 0 ? Math.floor(rawSpacing) : 0;
  }

  const { doctor, slots } = await loadDoctorAndSlots(
        clinicId,
        doctorName,
    date,
    typeof appointmentData.doctorId === 'string' ? appointmentData.doctorId : undefined
  );
  const totalSlots = slots.length;
  // Use current time (already defined above) to calculate capacity based on future slots only
  
  // Calculate maximum advance tokens per session (85% of FUTURE slots in each session)
  // This dynamically adjusts as time passes - capacity is recalculated based on remaining future slots
  // Group slots by sessionIndex to calculate per-session capacity
  const slotsBySession = new Map<number, DailySlot[]>();
  slots.forEach(slot => {
    const sessionSlots = slotsBySession.get(slot.sessionIndex) || [];
    sessionSlots.push(slot);
    slotsBySession.set(slot.sessionIndex, sessionSlots);
  });
  
  let maximumAdvanceTokens = 0;
  slotsBySession.forEach((sessionSlots) => {
    // Filter to only future slots (including current time)
    const futureSlots = sessionSlots.filter(slot => 
      isAfter(slot.time, now) || slot.time.getTime() >= now.getTime()
    );
    
    const futureSlotCount = futureSlots.length;
    const sessionMinimumWalkInReserve = futureSlotCount > 0 ? Math.ceil(futureSlotCount * 0.15) : 0;
    const sessionAdvanceCapacity = Math.max(futureSlotCount - sessionMinimumWalkInReserve, 0);
    maximumAdvanceTokens += sessionAdvanceCapacity;
  });

      const appointmentsRef = collection(db, 'appointments');
      const appointmentsQuery = query(
        appointmentsRef,
        where('clinicId', '==', clinicId),
        where('doctor', '==', doctorName),
      where('date', '==', dateStr),
    orderBy('slotIndex', 'asc')
  );

  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[BOOKING DEBUG] ====== NEW BOOKING REQUEST ======`, {
    requestId,
    clinicId,
    doctorName,
    date: dateStr,
    type,
    preferredSlotIndex: appointmentData.slotIndex,
    timestamp: new Date().toISOString()
  });

  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    // Fetch appointments fresh on each attempt to see latest state
    // This is important because between attempts, other transactions may have created appointments
    const appointmentsSnapshot = await getDocs(appointmentsQuery);
    const appointmentDocRefs = appointmentsSnapshot.docs.map(docSnap => doc(db, 'appointments', docSnap.id));

    console.log(`[BOOKING DEBUG] Request ${requestId}: Attempt ${attempt + 1}/${MAX_TRANSACTION_ATTEMPTS}`, {
      existingAppointmentsCount: appointmentsSnapshot.docs.length,
      timestamp: new Date().toISOString()
    });

    try {
      return await runTransaction(db, async transaction => {
        console.log(`[BOOKING DEBUG] Request ${requestId}: Transaction STARTED (attempt ${attempt + 1})`, {
          timestamp: new Date().toISOString()
        });
        
        // CRITICAL: Only prepare counter for walk-ins, not for advance bookings
        // Advance bookings use slotIndex + 1 for tokens, so counter is not needed
        let counterState: TokenCounterState | null = null;
        
        if (type === 'W') {
          counterState = await prepareNextTokenNumber(transaction, counterRef);
        }

        const appointmentSnapshots = await Promise.all(
          appointmentDocRefs.map(ref => transaction.get(ref))
        );
        const appointments = appointmentSnapshots
          .filter(snapshot => snapshot.exists())
          .map(snapshot => {
            const data = snapshot.data() as Appointment;
            return { ...data, id: snapshot.id };
          });

        const excludeAppointmentId =
          typeof appointmentData.existingAppointmentId === 'string' ? appointmentData.existingAppointmentId : undefined;
        const effectiveAppointments = excludeAppointmentId
          ? appointments.filter(appointment => appointment.id !== excludeAppointmentId)
          : appointments;

        if (type === 'A' && maximumAdvanceTokens >= 0) {
          const activeAdvanceTokens = effectiveAppointments.filter(appointment => {
            return (
              appointment.bookedVia !== 'Walk-in' &&
              typeof appointment.slotIndex === 'number' &&
              ACTIVE_STATUSES.has(appointment.status)
            );
          }).length;

          if (maximumAdvanceTokens === 0 || activeAdvanceTokens >= maximumAdvanceTokens) {
            const capacityError = new Error('Advance booking capacity for the day has been reached.');
            (capacityError as { code?: string }).code = 'A_CAPACITY_REACHED';
            throw capacityError;
          }
        }

        let numericToken = 0;
        let tokenNumber = '';
        let chosenSlotIndex = -1;
        let sessionIndexForNew = 0;
        let resolvedTimeString = '';
        let reservationRef: DocumentReference | null = null;

        if (type === 'W') {
          if (!counterState) {
            throw new Error('Counter state not prepared for walk-in booking');
          }
          const nextWalkInNumericToken = totalSlots + counterState.nextNumber;
          numericToken = nextWalkInNumericToken;
          tokenNumber = `W${String(numericToken).padStart(3, '0')}`;

          // Get all active advance appointments (including skipped) - now included in interval counting
          let activeAdvanceAppointments = effectiveAppointments.filter(appointment => {
            return (
              appointment.bookedVia !== 'Walk-in' &&
              typeof appointment.slotIndex === 'number' &&
              ACTIVE_STATUSES.has(appointment.status)
            );
          });

          const activeWalkIns = effectiveAppointments.filter(appointment => {
            return (
              appointment.bookedVia === 'Walk-in' &&
              typeof appointment.slotIndex === 'number' &&
              ACTIVE_STATUSES.has(appointment.status)
            );
          });

          // CRITICAL: Read existing reservations BEFORE calling scheduler
          // This prevents concurrent walk-ins from getting the same slot
          // Also clean up stale reservations (older than 30 seconds)
          // Calculate maximum possible slot index (for bucket compensation cases)
          const allSlotIndicesFromAppointments = effectiveAppointments
            .map(appointment => typeof appointment.slotIndex === 'number' ? appointment.slotIndex : -1)
            .filter(idx => idx >= 0);
          const maxSlotIndexFromAppointments = allSlotIndicesFromAppointments.length > 0 
            ? Math.max(...allSlotIndicesFromAppointments) 
            : -1;
          const lastSlotIndexFromSlots = totalSlots > 0 ? totalSlots - 1 : -1;
          const maxSlotIndex = Math.max(maxSlotIndexFromAppointments, lastSlotIndexFromSlots);
          // Read reservations up to maxSlotIndex + 20 to cover bucket compensation cases with extra buffer
          // This ensures we read the reservation for finalSlotIndex before any writes
          const maxSlotToRead = Math.max(totalSlots, maxSlotIndex + 20);
          
          const existingReservations = new Map<number, Date>();
          const staleReservationsToDelete: DocumentReference[] = [];
          
          for (let slotIdx = 0; slotIdx <= maxSlotToRead; slotIdx += 1) {
            const reservationId = buildReservationDocId(clinicId, doctorName, dateStr, slotIdx);
            const reservationRef = doc(db, 'slot-reservations', reservationId);
            const reservationSnapshot = await transaction.get(reservationRef);
            
            if (reservationSnapshot.exists()) {
              const reservationData = reservationSnapshot.data();
              const reservedAt = reservationData?.reservedAt;
              let reservedTime: Date | null = null;
              
              if (reservedAt) {
                try {
                  if (typeof reservedAt.toDate === 'function') {
                    reservedTime = reservedAt.toDate();
                  } else if (reservedAt instanceof Date) {
                    reservedTime = reservedAt;
                  } else if (reservedAt.seconds) {
                    reservedTime = new Date(reservedAt.seconds * 1000);
                  }
                  
                  if (reservedTime) {
                    const ageInSeconds = (now.getTime() - reservedTime.getTime()) / 1000;
                    const isBooked = reservationData.status === 'booked';
                    const threshold = isBooked ? 300 : 30; // 5 minutes for booked, 30 seconds for temporary

                    if (ageInSeconds <= threshold) {
                      // Check if there's an existing appointment at this slot
                      const existingAppt = effectiveAppointments.find(
                        a => typeof a.slotIndex === 'number' && a.slotIndex === slotIdx
                      );

                      // If appointment exists and is NOT active (Cancelled or No-show), ignore reservation
                      if (existingAppt && !ACTIVE_STATUSES.has(existingAppt.status)) {
                        staleReservationsToDelete.push(reservationRef);
                      } else {
                        // No appointment, or appointment is active - respect reservation
                        existingReservations.set(slotIdx, reservedTime);
                      }
                    } else {
                      // Stale reservation - mark for deletion
                      staleReservationsToDelete.push(reservationRef);
                    }
                  } else {
                    // Can't parse time - assume stale and delete
                    staleReservationsToDelete.push(reservationRef);
                  }
                } catch (e) {
                  // Parsing error - assume stale and delete
                  staleReservationsToDelete.push(reservationRef);
                }
              } else {
                // No reservedAt timestamp - assume stale and delete
                staleReservationsToDelete.push(reservationRef);
              }
            }
          }
          
          // Delete stale reservations within the transaction
          for (const staleRef of staleReservationsToDelete) {
            transaction.delete(staleRef);
          }

          // Create placeholder walk-in candidates for reserved slots
          // This tells the scheduler that these slots are already taken
          const reservedWalkInCandidates = Array.from(existingReservations.entries()).map(([slotIndex, reservedTime], idx) => ({
            id: `__reserved_${slotIndex}__`,
            numericToken: totalSlots + 1000 + idx, // High token number to ensure they're placed correctly
            createdAt: reservedTime,
            currentSlotIndex: slotIndex,
          }));

          const baseWalkInCandidates = activeWalkIns.map(appointment => ({
            id: appointment.id,
            numericToken: typeof appointment.numericToken === 'number' ? appointment.numericToken : 0,
            createdAt: toDate(appointment.createdAt),
            currentSlotIndex: typeof appointment.slotIndex === 'number' ? appointment.slotIndex : undefined,
          }));

          const newWalkInCandidate = {
            id: '__new_walk_in__',
            numericToken: nextWalkInNumericToken,
            createdAt: now,
          };

          const oneHourAhead = addMinutes(now, 60);
          const hasExistingWalkIns = activeWalkIns.length > 0;
          
          // Find cancelled slots in 1-hour window
          const cancelledSlotsInWindow: Array<{ slotIndex: number; slotTime: Date }> = [];
          let bucketCount = 0;
          
          // Build set of slots with active appointments
          const slotsWithActiveAppointments = new Set<number>();
          effectiveAppointments.forEach(appt => {
            if (
              typeof appt.slotIndex === 'number' &&
              ACTIVE_STATUSES.has(appt.status)
            ) {
              slotsWithActiveAppointments.add(appt.slotIndex);
            }
          });
          
          // Get all active walk-ins with their slot times for comparison
          const activeWalkInsWithTimes = activeWalkIns
            .filter(appt => typeof appt.slotIndex === 'number')
            .map(appt => {
              const slotMeta = slots[appt.slotIndex!];
              return {
                appointment: appt,
                slotIndex: appt.slotIndex!,
                slotTime: slotMeta?.time,
              };
            })
            .filter(item => item.slotTime !== undefined);
          
          for (const appointment of effectiveAppointments) {
            if (
              (appointment.status === 'Cancelled' || appointment.status === 'No-show') &&
              typeof appointment.slotIndex === 'number'
            ) {
              const slotMeta = slots[appointment.slotIndex];
              if (slotMeta) {
                // For bucket count: Include past slots (within 1 hour window)
                // Only check upper bound (1 hour ahead), don't filter out past slots
                const isInBucketWindow = !isAfter(slotMeta.time, oneHourAhead);
                
                if (isInBucketWindow) {
                // Only process if there's no active appointment at this slot
                if (!slotsWithActiveAppointments.has(appointment.slotIndex)) {
                  // Check if there are walk-ins scheduled AFTER this cancelled slot's time
                  const hasWalkInsAfter = activeWalkInsWithTimes.some(
                    walkIn => walkIn.slotTime && isAfter(walkIn.slotTime, slotMeta.time)
                  );
                  
                  if (hasWalkInsAfter) {
                    // There are walk-ins after this cancelled slot - walk-ins cannot use it
                    // Add to bucket count if walk-ins exist
                    if (hasExistingWalkIns) {
                      bucketCount += 1;
                    }
                    // If no walk-ins exist but there are walk-ins after (shouldn't happen, but handle it),
                    // it goes to bucket count
          } else {
                    // No walk-ins after this cancelled slot - walk-ins CAN use it
                      // Only add to cancelledSlotsInWindow if slot is not in the past (for direct use)
                      if (!hasExistingWalkIns && !isBefore(slotMeta.time, now)) {
                        // No walk-ins exist at all - first walk-in can use this cancelled slot (if not past)
                      cancelledSlotsInWindow.push({
                        slotIndex: appointment.slotIndex,
                        slotTime: slotMeta.time,
                      });
                    }
                    // If walk-ins exist but none after this slot, walk-ins can still use it
                    // So we don't add it to bucket count - it's available for walk-ins
                    }
                  
                  // CRITICAL FIX: When there are no walk-ins yet, count cancelled/no-show slots (especially past slots)
                  // as potential bucket slots. This allows Strategy 4 to trigger when all slots are filled.
                  // Only count slots that are NOT already in cancelledSlotsInWindow (i.e., past slots)
                  if (!hasExistingWalkIns) {
                    const isNotInCancelledWindow = cancelledSlotsInWindow.every(
                      cs => cs.slotIndex !== appointment.slotIndex
                    );
                    
                    if (isNotInCancelledWindow) {
                      // This cancelled/no-show slot (likely a past slot) can be used for bucket compensation
                      bucketCount += 1;
                      console.info(`[Walk-in Scheduling] Adding cancelled/no-show slot ${appointment.slotIndex} to bucket count (no walk-ins yet, past slot):`, {
                        slotIndex: appointment.slotIndex,
                        slotTime: slotMeta.time.toISOString(),
                        status: appointment.status,
                        isPast: isBefore(slotMeta.time, now),
                      });
                    }
                  }
                  }
                }
              }
            }
          }
          
          // Calculate bucket count on-the-fly from appointments (no Firestore needed)
          // Bucket count = cancelled slots in 1-hour window that have walk-ins AFTER them
          // Subtract walk-ins placed outside availability (they're "using" bucket slots)
          // This is calculated dynamically, so it's always accurate
          
          // Count walk-ins placed outside availability (slotIndex beyond slots.length)
          // These are "using" bucket slots, so we subtract them from the bucket count
          const walkInsOutsideAvailability = activeWalkIns.filter(appt => {
            if (typeof appt.slotIndex !== 'number') return false;
            return appt.slotIndex >= slots.length; // Outside availability
          });
          const usedBucketSlots = walkInsOutsideAvailability.length;
          
          // Effective bucket count = cancelled slots in bucket - walk-ins using bucket slots
          const firestoreBucketCount = Math.max(0, bucketCount - usedBucketSlots);
          
          console.info('[Walk-in Scheduling] Bucket calculation:', {
            cancelledSlotsInBucket: bucketCount,
            walkInsOutsideAvailability: usedBucketSlots,
            effectiveBucketCount: firestoreBucketCount,
          });
          
          // DEBUG: Additional detailed bucket calculation info
          console.info('[Walk-in Scheduling] DEBUG - Bucket Calculation Details:', {
            totalEffectiveAppointments: effectiveAppointments.length,
            cancelledAppointments: effectiveAppointments.filter(a => a.status === 'Cancelled').length,
            noShowAppointments: effectiveAppointments.filter(a => a.status === 'No-show').length,
            activeWalkInsCount: activeWalkIns.length,
            walkInsOutsideAvailabilityDetails: walkInsOutsideAvailability.map(w => ({
              id: w.id,
              slotIndex: w.slotIndex,
              status: w.status,
            })),
            slotsWithActiveAppointments: Array.from(slotsWithActiveAppointments).sort((a, b) => a - b),
            oneHourAhead: oneHourAhead.toISOString(),
            currentTime: now.toISOString(),
          });

          const averageConsultingTime = doctor.averageConsultingTime || 15;
          const totalMinutes =
            slots.length > 0
              ? Math.max(
                  differenceInMinutes(
                    addMinutes(slots[slots.length - 1].time, averageConsultingTime),
                    slots[0].time
                  ),
                  0
                )
              : 0;
          const completedCount = effectiveAppointments.filter(
            appointment => appointment.status === 'Completed'
          ).length;
          const expectedMinutes = completedCount * averageConsultingTime;
          const actualElapsedRaw =
            slots.length > 0 ? differenceInMinutes(now, slots[0].time) : 0;
          const actualElapsed = Math.max(0, Math.min(actualElapsedRaw, totalMinutes));
          const delayMinutes = actualElapsed - expectedMinutes;

          // Build set of cancelled slots in bucket (blocked from walk-in scheduling)
          // Only cancelled slots that have walk-ins AFTER them go to bucket
          const cancelledSlotsInBucket = new Set<number>();
          if (hasExistingWalkIns) {
            console.warn('[Walk-in Scheduling] Building cancelled slots in bucket. Active walk-ins:', activeWalkInsWithTimes.length);
            for (const appointment of effectiveAppointments) {
              if (
                (appointment.status === 'Cancelled' || appointment.status === 'No-show') &&
                typeof appointment.slotIndex === 'number'
              ) {
                const slotMeta = slots[appointment.slotIndex];
                if (slotMeta) {
                  // For bucket: Include past slots (within 1 hour window)
                  // Only check upper bound (1 hour ahead), don't filter out past slots
                  const isInBucketWindow = !isAfter(slotMeta.time, oneHourAhead);
                  const hasActiveAppt = slotsWithActiveAppointments.has(appointment.slotIndex);
                  
                  console.warn(`[Walk-in Scheduling] Checking cancelled slot ${appointment.slotIndex}:`, {
                    time: slotMeta.time.toISOString(),
                    isInBucketWindow,
                    hasActiveAppt,
                    status: appointment.status,
                  });
                  
                  if (
                    isInBucketWindow &&
                    !hasActiveAppt
                  ) {
                    // Check if there are walk-ins scheduled AFTER this cancelled slot's time
                    const hasWalkInsAfter = activeWalkInsWithTimes.some(
                      walkIn => walkIn.slotTime && isAfter(walkIn.slotTime, slotMeta.time)
                    );
                    
                    console.warn(`[Walk-in Scheduling] Cancelled slot ${appointment.slotIndex}: hasWalkInsAfter=${hasWalkInsAfter}`, {
                      cancelledSlotTime: slotMeta.time.toISOString(),
                      walkInTimes: activeWalkInsWithTimes.map(w => w.slotTime?.toISOString()),
                    });
                    
                    if (hasWalkInsAfter) {
                      // This is a cancelled slot with walk-ins after it - block it from walk-in scheduling
                      // It goes to bucket (only A tokens can use it, or bucket can use it when all slots filled)
                      cancelledSlotsInBucket.add(appointment.slotIndex);
                      console.warn(`[Walk-in Scheduling] ✅ BLOCKING cancelled slot ${appointment.slotIndex} (has walk-ins after)`);
      } else {
                      // If no walk-ins after this slot, it's NOT in bucket - walk-ins CAN use it
                      console.warn(`[Walk-in Scheduling] ❌ NOT blocking cancelled slot ${appointment.slotIndex} (no walk-ins after)`);
            }
          } else {
                    console.warn(`[Walk-in Scheduling] Skipping cancelled slot ${appointment.slotIndex}: isInBucketWindow=${isInBucketWindow}, hasActiveAppt=${hasActiveAppt}`);
                  }
            }
          }
        }
      } else {
            console.warn('[Walk-in Scheduling] No existing walk-ins, skipping bucket logic');
          }
          
          console.warn('[Walk-in Scheduling] Final cancelled slots in bucket:', Array.from(cancelledSlotsInBucket));
          
          // Also track cancelled slots that walk-ins CAN use (no walk-ins after them)
          const cancelledSlotsAvailableForWalkIns: Array<{ slotIndex: number; slotTime: Date }> = [];
          if (hasExistingWalkIns) {
            for (const appointment of effectiveAppointments) {
              if (
                (appointment.status === 'Cancelled' || appointment.status === 'No-show') &&
                typeof appointment.slotIndex === 'number'
              ) {
                const slotMeta = slots[appointment.slotIndex];
                if (
                  slotMeta &&
                  !isBefore(slotMeta.time, now) &&
                  !isAfter(slotMeta.time, oneHourAhead) &&
                  !slotsWithActiveAppointments.has(appointment.slotIndex)
                ) {
                  // Check if there are walk-ins scheduled AFTER this cancelled slot's time
                  const hasWalkInsAfter = activeWalkInsWithTimes.some(
                    walkIn => walkIn.slotTime && isAfter(walkIn.slotTime, slotMeta.time)
                  );
                  
                  if (!hasWalkInsAfter) {
                    // No walk-ins after this slot - walk-ins CAN use it
                    cancelledSlotsAvailableForWalkIns.push({
                      slotIndex: appointment.slotIndex,
                      slotTime: slotMeta.time,
                    });
                  }
                }
              }
            }
          }

          type ScheduleAttemptResult = {
            schedule: ReturnType<typeof computeWalkInSchedule>;
            newAssignment: SchedulerAssignment;
          };

          const attemptSchedule = (useCancelledSlot: number | null): ScheduleAttemptResult | null => {
            try {
              // If using a cancelled slot directly (first walk-in case), create assignment directly
              if (useCancelledSlot !== null) {
                const cancelledSlot = slots[useCancelledSlot];
                if (cancelledSlot) {
                  return {
                    schedule: { assignments: [] },
                    newAssignment: {
                      id: '__new_walk_in__',
                      slotIndex: useCancelledSlot,
                      sessionIndex: cancelledSlot.sessionIndex,
                      slotTime: cancelledSlot.time,
                    },
                  };
                }
                return null;
              }

              // Normal scheduling - run scheduler
              // Include cancelled slots in bucket as "blocked" advance appointments
              // so the scheduler treats them as occupied and doesn't assign walk-ins to them
              // Include all advance appointments (including skipped) in interval counting
              const blockedAdvanceAppointments = activeAdvanceAppointments.map(entry => ({
                id: entry.id,
                slotIndex: typeof entry.slotIndex === 'number' ? entry.slotIndex : -1,
              }));
              
              // Add cancelled slots in bucket as blocked slots (treat as occupied)
              // These are cancelled slots that have walk-ins AFTER them, so walk-ins cannot use them
              console.warn('[Walk-in Scheduling] Before blocking - blockedAdvanceAppointments count:', blockedAdvanceAppointments.length);
              console.warn('[Walk-in Scheduling] Cancelled slots in bucket:', Array.from(cancelledSlotsInBucket));
              
              if (cancelledSlotsInBucket.size > 0) {
                console.warn('[Walk-in Scheduling] ✅ BLOCKING cancelled slots in bucket:', Array.from(cancelledSlotsInBucket));
                cancelledSlotsInBucket.forEach(slotIndex => {
                  blockedAdvanceAppointments.push({
                    id: `__blocked_cancelled_${slotIndex}`,
                    slotIndex: slotIndex,
                  });
                  console.warn(`[Walk-in Scheduling] Added blocked cancelled slot ${slotIndex} to advance appointments`);
                });
              } else {
                console.warn('[Walk-in Scheduling] ❌ No cancelled slots to block (bucket is empty)');
              }
              
              console.warn('[Walk-in Scheduling] After blocking - blockedAdvanceAppointments count:', blockedAdvanceAppointments.length);
              console.warn('[Walk-in Scheduling] Blocked advance appointments:', blockedAdvanceAppointments.map(a => ({ id: a.id, slotIndex: a.slotIndex })));
              
              const schedule = computeWalkInSchedule({
                slots,
                now,
                walkInTokenAllotment: walkInSpacingValue,
                advanceAppointments: blockedAdvanceAppointments,
                walkInCandidates: [...baseWalkInCandidates, ...reservedWalkInCandidates, newWalkInCandidate],
              });

              const newAssignment = schedule.assignments.find(
                assignment => assignment.id === '__new_walk_in__'
              );
              if (!newAssignment) {
                console.log('[Walk-in Scheduling] No assignment found for new walk-in');
                return null;
              }

              console.log('[Walk-in Scheduling] Scheduler assigned new walk-in to slot:', newAssignment.slotIndex);
              console.log('[Walk-in Scheduling] Blocked cancelled slots in bucket:', Array.from(cancelledSlotsInBucket));
              console.log('[Walk-in Scheduling] Active walk-ins with times:', activeWalkInsWithTimes.map(w => ({ slotIndex: w.slotIndex, time: w.slotTime })));
              
              // Check if the assigned slot is a cancelled slot
              const assignedAppointment = effectiveAppointments.find(
                apt => apt.slotIndex === newAssignment.slotIndex &&
                (apt.status === 'Cancelled' || apt.status === 'No-show')
              );
              
              if (assignedAppointment) {
                const assignedSlotMeta = slots[newAssignment.slotIndex];
                console.log(`[Walk-in Scheduling] Assigned slot ${newAssignment.slotIndex} is a cancelled/no-show slot at time:`, assignedSlotMeta?.time);
                
                // Check if this cancelled slot should be blocked (has walk-ins after it)
                if (hasExistingWalkIns && cancelledSlotsInBucket.has(newAssignment.slotIndex)) {
                  // This shouldn't happen since we blocked them, but reject if it does
                  console.error('[Walk-in Scheduling] ERROR: Scheduler assigned to blocked cancelled slot, rejecting:', newAssignment.slotIndex);
                  return null;
                } else if (assignedAppointment) {
                  console.log(`[Walk-in Scheduling] Assigned cancelled slot ${newAssignment.slotIndex} is available (no walk-ins after it)`);
                }
              }

              // Double-check: Cancelled slots in bucket are now blocked via advance appointments,
              // so the scheduler shouldn't assign to them. But verify just in case.
              if (hasExistingWalkIns && cancelledSlotsInBucket.has(newAssignment.slotIndex)) {
                // This shouldn't happen since we blocked them, but reject if it does
                console.error('[Walk-in Scheduling] ERROR: Scheduler assigned to blocked cancelled slot (double-check), rejecting:', newAssignment.slotIndex);
                return null;
              }

              return { schedule, newAssignment };
            } catch {
              return null;
            }
          };

          // Check if all slots in availability (non-past, excluding cancelled slots in bucket) are filled
          const allSlotsFilled = (() => {
            const occupiedSlots = new Set<number>();
            effectiveAppointments.forEach(appt => {
              if (
                typeof appt.slotIndex === 'number' &&
                ACTIVE_STATUSES.has(appt.status)
              ) {
                occupiedSlots.add(appt.slotIndex);
              }
            });
            // Check if all slots in availability (future slots only, excluding cancelled slots in bucket) are occupied
            const emptySlots: number[] = [];
            const futureSlotsCount: number[] = [];
            const cancelledInBucketSlots: number[] = [];
            
            for (let i = 0; i < slots.length; i++) {
              if (isBefore(slots[i].time, now)) {
                continue; // Skip past slots
              }
              futureSlotsCount.push(i);
              // Skip cancelled slots in bucket - they're blocked, not available
              if (hasExistingWalkIns && cancelledSlotsInBucket.has(i)) {
                cancelledInBucketSlots.push(i);
                continue; // Skip cancelled slots in bucket
              }
              if (!occupiedSlots.has(i)) {
                emptySlots.push(i); // Found an empty slot
              }
            }
            
            const isAllSlotsFilled = emptySlots.length === 0;
            
            // DEBUG: Log allSlotsFilled calculation details
            console.info('[Walk-in Scheduling] DEBUG - allSlotsFilled Calculation:', {
              futureSlotsTotal: futureSlotsCount.length,
              futureSlots: futureSlotsCount,
              cancelledInBucketSlotsTotal: cancelledInBucketSlots.length,
              cancelledInBucketSlots: cancelledInBucketSlots,
              emptySlotsTotal: emptySlots.length,
              emptySlots: emptySlots,
              occupiedSlotsTotal: occupiedSlots.size,
              occupiedSlots: Array.from(occupiedSlots).sort((a, b) => a - b),
              allSlotsFilled: isAllSlotsFilled,
            });
            
            return isAllSlotsFilled; // All available future slots are occupied
          })();

          let scheduleAttempt: ScheduleAttemptResult | null = null;
          let usedCancelledSlot: number | null = null;
          let usedBucket = false;
          let bucketReservationRef: DocumentReference | null = null;

          // Strategy 1: If no walk-ins exist and cancelled slot in window, use it directly
          if (!hasExistingWalkIns && cancelledSlotsInWindow.length > 0) {
            // Sort by slotIndex (earliest first)
            cancelledSlotsInWindow.sort((a, b) => a.slotIndex - b.slotIndex);
            const earliestCancelledSlot = cancelledSlotsInWindow[0];
            scheduleAttempt = attemptSchedule(earliestCancelledSlot.slotIndex);
            if (scheduleAttempt) {
              usedCancelledSlot = earliestCancelledSlot.slotIndex;
            }
          }

          // Strategy 2: If walk-ins exist, check for cancelled slots available for walk-ins (no walk-ins after them)
          if (!scheduleAttempt && hasExistingWalkIns && cancelledSlotsAvailableForWalkIns.length > 0) {
            // Sort by slotIndex (earliest first)
            cancelledSlotsAvailableForWalkIns.sort((a, b) => a.slotIndex - b.slotIndex);
            const earliestAvailableCancelledSlot = cancelledSlotsAvailableForWalkIns[0];
            scheduleAttempt = attemptSchedule(earliestAvailableCancelledSlot.slotIndex);
            if (scheduleAttempt) {
              usedCancelledSlot = earliestAvailableCancelledSlot.slotIndex;
            }
          }

          // Strategy 3: Try normal scheduling
          if (!scheduleAttempt) {
            scheduleAttempt = attemptSchedule(null);
            
            // Check if scheduler assigned to a cancelled slot in bucket (shouldn't happen, but reject if it does)
            if (scheduleAttempt && hasExistingWalkIns && cancelledSlotsInBucket.has(scheduleAttempt.newAssignment.slotIndex)) {
              // Reject - this slot is in the bucket, shouldn't be used by walk-ins
              scheduleAttempt = null;
            }
          }

          // Strategy 4: If normal scheduling fails and all slots are filled, check bucket count
          // Bucket count is calculated on-the-fly, so we can use it directly
          
          // DEBUG: Log all conditions before Strategy 4 check
          console.info('[Walk-in Scheduling] DEBUG - Strategy 4 Pre-Check:', {
            scheduleAttempt: !!scheduleAttempt,
            allSlotsFilled,
            hasExistingWalkIns,
            activeWalkInsCount: activeWalkIns.length,
            firestoreBucketCount,
            bucketCount,
            usedBucketSlots,
            totalSlots: slots.length,
            occupiedSlotsCount: effectiveAppointments.filter(a => 
              typeof a.slotIndex === 'number' && 
              ACTIVE_STATUSES.has(a.status)
            ).length,
            cancelledNoShowCount: effectiveAppointments.filter(a => 
              (a.status === 'Cancelled' || a.status === 'No-show')
            ).length,
            willTriggerBucketCompensation: !scheduleAttempt && allSlotsFilled && (hasExistingWalkIns || firestoreBucketCount > 0) && firestoreBucketCount > 0,
          });
          
          // DEBUG: Log why Strategy 4 might NOT trigger
          if (!scheduleAttempt && (!allSlotsFilled || !hasExistingWalkIns || firestoreBucketCount <= 0)) {
            console.info('[Walk-in Scheduling] DEBUG - ❌ Strategy 4 NOT Triggered - Reasons:', {
              scheduleAttemptExists: !!scheduleAttempt,
              allSlotsFilled,
              hasExistingWalkIns,
              firestoreBucketCount,
            reason: !allSlotsFilled ? 'allSlotsFilled is false' : 
                    !hasExistingWalkIns && firestoreBucketCount <= 0 ? 'hasExistingWalkIns is false AND firestoreBucketCount <= 0' : 
                    firestoreBucketCount <= 0 ? `firestoreBucketCount (${firestoreBucketCount}) <= 0` : 
                    'unknown',
            });
          }
          
          // Strategy 4: Trigger if all slots are filled AND (has existing walk-ins OR has cancelled/no-show slots for bucket)
          // This allows bucket compensation even when there are no walk-ins yet, as long as there are cancelled/no-show slots
          if (!scheduleAttempt && allSlotsFilled && (hasExistingWalkIns || firestoreBucketCount > 0) && firestoreBucketCount > 0) {
            console.info('[Walk-in Scheduling] DEBUG - ✅ Strategy 4 TRIGGERED - Bucket Compensation Starting');
            
            // CRITICAL: Re-calculate bucket count within transaction to prevent concurrent usage
            // Count walk-ins placed outside availability (they're "using" bucket slots)
            const walkInsOutsideAvailabilityInTx = effectiveAppointments.filter(appt => {
              return (
                appt.bookedVia === 'Walk-in' &&
                typeof appt.slotIndex === 'number' &&
                appt.slotIndex >= slots.length &&
                ACTIVE_STATUSES.has(appt.status)
              );
            });
            const usedBucketSlotsInTx = walkInsOutsideAvailabilityInTx.length;
            const effectiveBucketCountInTx = Math.max(0, bucketCount - usedBucketSlotsInTx);
            
            // If bucket count is now 0, another concurrent request used it - fail and retry
            if (effectiveBucketCountInTx <= 0) {
              console.warn('[Walk-in Scheduling] Bucket count became 0 during transaction - concurrent request used it', {
                originalBucketCount: firestoreBucketCount,
                bucketCountInTx: effectiveBucketCountInTx,
                usedBucketSlotsInTx,
              });
              const bucketError = new Error('Bucket slot was just used by another concurrent request. Retrying...');
              (bucketError as { code?: string }).code = RESERVATION_CONFLICT_CODE;
              throw bucketError;
            }
            
            // All slots in availability are filled - create new slot at end (outside availability)
            // This will create a slot beyond the availability time
            usedBucket = true;
            
            // Find the last walk-in position to use as anchor for interval calculation
            let lastWalkInSlotIndex = -1;
            if (activeWalkIns.length > 0) {
              const sortedWalkIns = [...activeWalkIns].sort((a, b) => 
                (typeof a.slotIndex === 'number' ? a.slotIndex : -1) - 
                (typeof b.slotIndex === 'number' ? b.slotIndex : -1)
              );
              const lastWalkIn = sortedWalkIns[sortedWalkIns.length - 1];
              lastWalkInSlotIndex = typeof lastWalkIn?.slotIndex === 'number' 
                ? lastWalkIn.slotIndex 
                : -1;
            }
            
            // Find the last slotIndex from the slots array (represents last slot in last session)
            const lastSlotIndexFromSlots = slots.length > 0 ? slots.length - 1 : -1;
            
            // Calculate new slotIndex based on walkInTokenAllotment interval logic
            let newSlotIndex: number;
            
            if (lastWalkInSlotIndex >= 0 && walkInSpacingValue > 0) {
              // CRITICAL: Implement interval logic - place walk-in after nth advance appointment
              // where n = walkInTokenAllotment (walkInSpacingValue)
              
              // Find all advance appointments after the last walk-in
              const advanceAppointmentsAfterLastWalkIn = activeAdvanceAppointments
                .filter(appt => {
                  const apptSlotIndex = typeof appt.slotIndex === 'number' ? appt.slotIndex : -1;
                  return apptSlotIndex > lastWalkInSlotIndex;
                })
                .sort((a, b) => {
                  const aIdx = typeof a.slotIndex === 'number' ? a.slotIndex : -1;
                  const bIdx = typeof b.slotIndex === 'number' ? b.slotIndex : -1;
                  return aIdx - bIdx;
                });
              
              const advanceCountAfterLastWalkIn = advanceAppointmentsAfterLastWalkIn.length;
              
              console.info('[Walk-in Scheduling] Bucket compensation - interval calculation:', {
                lastWalkInSlotIndex,
                walkInSpacingValue,
                advanceCountAfterLastWalkIn,
                advanceAppointmentsAfterLastWalkIn: advanceAppointmentsAfterLastWalkIn.map(a => ({
                  id: a.id,
                  slotIndex: a.slotIndex
                }))
              });
              
              if (advanceCountAfterLastWalkIn > walkInSpacingValue) {
                // Place walk-in after the nth advance appointment (where n = walkInSpacingValue)
                const nthAdvanceAppointment = advanceAppointmentsAfterLastWalkIn[walkInSpacingValue - 1];
                const nthAdvanceSlotIndex = typeof nthAdvanceAppointment.slotIndex === 'number' 
                  ? nthAdvanceAppointment.slotIndex 
                  : -1;
                
                if (nthAdvanceSlotIndex >= 0) {
                  // Place walk-in right after the nth advance appointment
                  newSlotIndex = nthAdvanceSlotIndex + 1;
                  console.info('[Walk-in Scheduling] Bucket compensation - placing after nth advance:', {
                    nth: walkInSpacingValue,
                    nthAdvanceSlotIndex,
                    newSlotIndex
                  });
                } else {
                  // Fallback: place after last advance appointment
                  const lastAdvanceAfterWalkIn = advanceAppointmentsAfterLastWalkIn[advanceAppointmentsAfterLastWalkIn.length - 1];
                  const lastAdvanceSlotIndex = typeof lastAdvanceAfterWalkIn.slotIndex === 'number' 
                    ? lastAdvanceAfterWalkIn.slotIndex 
                    : -1;
                  newSlotIndex = lastAdvanceSlotIndex >= 0 ? lastAdvanceSlotIndex + 1 : lastSlotIndexFromSlots + 1;
                  console.info('[Walk-in Scheduling] Bucket compensation - fallback: placing after last advance:', {
                    lastAdvanceSlotIndex,
                    newSlotIndex
                  });
                }
              } else {
                // Not enough advance appointments - place after the last advance appointment
                if (advanceAppointmentsAfterLastWalkIn.length > 0) {
                  const lastAdvanceAfterWalkIn = advanceAppointmentsAfterLastWalkIn[advanceAppointmentsAfterLastWalkIn.length - 1];
                  const lastAdvanceSlotIndex = typeof lastAdvanceAfterWalkIn.slotIndex === 'number' 
                    ? lastAdvanceAfterWalkIn.slotIndex 
                    : -1;
                  newSlotIndex = lastAdvanceSlotIndex >= 0 ? lastAdvanceSlotIndex + 1 : lastSlotIndexFromSlots + 1;
                  console.info('[Walk-in Scheduling] Bucket compensation - not enough advances, placing after last:', {
                    lastAdvanceSlotIndex,
                    newSlotIndex
                  });
                } else {
                  // No advance appointments after last walk-in - place after last walk-in
                  newSlotIndex = lastWalkInSlotIndex + 1;
                  console.info('[Walk-in Scheduling] Bucket compensation - no advances after walk-in, placing after walk-in:', {
                    lastWalkInSlotIndex,
                    newSlotIndex
                  });
                }
              }
            } else {
              // No walk-ins exist or no spacing configured - use sequential placement
            // Find the last slotIndex used across ALL sessions for this day
            const allSlotIndicesFromAppointments = effectiveAppointments
              .map(appointment => typeof appointment.slotIndex === 'number' ? appointment.slotIndex : -1)
              .filter(idx => idx >= 0);
            
            const maxSlotIndexFromAppointments = allSlotIndicesFromAppointments.length > 0 
              ? Math.max(...allSlotIndicesFromAppointments) 
              : -1;
            
            const maxSlotIndex = Math.max(maxSlotIndexFromAppointments, lastSlotIndexFromSlots);
              newSlotIndex = maxSlotIndex + 1;
            
              console.info('[Walk-in Scheduling] Bucket compensation - sequential placement (no walk-ins or spacing):', {
              maxSlotIndexFromAppointments,
              lastSlotIndexFromSlots,
              maxSlotIndex,
                newSlotIndex
              });
            }
            
            // CRITICAL: Check if this slotIndex is already reserved or occupied by another concurrent request
            // Check for existing reservation
            const bucketReservationId = buildReservationDocId(clinicId, doctorName, dateStr, newSlotIndex);
            bucketReservationRef = doc(db, 'slot-reservations', bucketReservationId);
            const bucketReservationSnapshot = await transaction.get(bucketReservationRef);
            
            // Check if there's already an appointment at this slotIndex
            const existingAppointmentAtSlot = effectiveAppointments.find(
              apt => typeof apt.slotIndex === 'number' && apt.slotIndex === newSlotIndex && ACTIVE_STATUSES.has(apt.status)
            );
            
            if (bucketReservationSnapshot.exists() || existingAppointmentAtSlot) {
              console.warn('[Walk-in Scheduling] SlotIndex already reserved or occupied - concurrent request conflict', {
                newSlotIndex,
                hasReservation: bucketReservationSnapshot.exists(),
                hasAppointment: !!existingAppointmentAtSlot,
              });
              const slotError = new Error('Slot was just reserved by another concurrent request. Retrying...');
              (slotError as { code?: string }).code = RESERVATION_CONFLICT_CODE;
              throw slotError;
            }
            
            // Create reservation for the new bucket slot to prevent concurrent usage
            transaction.set(bucketReservationRef, {
              clinicId,
              doctorName,
              date: dateStr,
              slotIndex: newSlotIndex,
              reservedAt: serverTimestamp(),
              type: 'bucket',
            });
            
            console.info('[Walk-in Scheduling] Bucket compensation - interval-based placement:', {
              lastWalkInSlotIndex,
              walkInSpacingValue,
              newSlotIndex,
              totalSlots: slots.length,
              lastSlotIndexFromSlots,
              sessions: slots.length > 0 ? new Set(slots.map(s => s.sessionIndex)).size : 0,
            });
            
            // Calculate time for the new slot based on its position
            // If newSlotIndex is within availability, use the slot's time
            // If newSlotIndex is outside availability, calculate based on last appointment or last slot
            let newSlotTime: Date;
            const slotDuration = doctor.averageConsultingTime || 15;
            
            if (newSlotIndex < slots.length) {
              // New slot is within availability - use the slot's time
              const slotMeta = slots[newSlotIndex];
              newSlotTime = slotMeta ? slotMeta.time : addMinutes(now, slotDuration);
              console.info('[Walk-in Scheduling] Bucket compensation - slot within availability:', {
                newSlotIndex,
                slotTime: newSlotTime
              });
            } else {
              // New slot is outside availability - calculate time based on reference appointment
              // Find the appointment at the slotIndex before newSlotIndex (or last appointment)
              const referenceAppointment = effectiveAppointments
                .filter(appt => {
                  const apptSlotIndex = typeof appt.slotIndex === 'number' ? appt.slotIndex : -1;
                  return apptSlotIndex >= 0 && apptSlotIndex < newSlotIndex && ACTIVE_STATUSES.has(appt.status);
                })
                .sort((a, b) => {
                  const aIdx = typeof a.slotIndex === 'number' ? a.slotIndex : -1;
                  const bIdx = typeof b.slotIndex === 'number' ? b.slotIndex : -1;
                  return bIdx - aIdx; // Get the last one before newSlotIndex
                })[0];
              
              if (referenceAppointment && referenceAppointment.time) {
                // Use the reference appointment's time + slot duration
                try {
                  const appointmentDate = parse(dateStr, 'd MMMM yyyy', new Date());
                  const referenceTime = parse(referenceAppointment.time, 'hh:mm a', appointmentDate);
                  newSlotTime = addMinutes(referenceTime, slotDuration);
                  console.info('[Walk-in Scheduling] Bucket compensation - time from reference appointment:', {
                    referenceSlotIndex: referenceAppointment.slotIndex,
                    referenceTime: referenceAppointment.time,
                    newSlotTime
                  });
                } catch (e) {
                  // Fallback: use last slot time + duration
                  const lastSlot = slots[slots.length - 1];
                  const slotsBeyondAvailability = newSlotIndex - lastSlotIndexFromSlots;
                  newSlotTime = lastSlot 
              ? addMinutes(lastSlot.time, slotDuration * slotsBeyondAvailability) 
              : addMinutes(now, slotDuration);
                }
              } else {
                // No reference appointment - use last slot time + duration
                const lastSlot = slots[slots.length - 1];
                const slotsBeyondAvailability = newSlotIndex - lastSlotIndexFromSlots;
                newSlotTime = lastSlot 
                  ? addMinutes(lastSlot.time, slotDuration * slotsBeyondAvailability) 
                  : addMinutes(now, slotDuration);
                console.info('[Walk-in Scheduling] Bucket compensation - time from last slot:', {
              lastSlotIndexFromSlots,
              slotsBeyondAvailability,
                  newSlotTime
                });
              }
            }
            
            console.info('[Walk-in Scheduling] Bucket compensation - final time calculation:', {
              newSlotIndex,
              newSlotTime,
              isWithinAvailability: newSlotIndex < slots.length
            });
            
            // Determine sessionIndex for the new slot
            let sessionIndexForNewSlot: number;
            if (newSlotIndex < slots.length) {
              // Slot is within availability - use the slot's sessionIndex
              const slotMeta = slots[newSlotIndex];
              sessionIndexForNewSlot = slotMeta?.sessionIndex ?? 0;
            } else {
              // Slot is outside availability - find reference appointment's sessionIndex or use last slot's
              const referenceAppointment = effectiveAppointments
                .filter(appt => {
                  const apptSlotIndex = typeof appt.slotIndex === 'number' ? appt.slotIndex : -1;
                  return apptSlotIndex >= 0 && apptSlotIndex < newSlotIndex && ACTIVE_STATUSES.has(appt.status);
                })
                .sort((a, b) => {
                  const aIdx = typeof a.slotIndex === 'number' ? a.slotIndex : -1;
                  const bIdx = typeof b.slotIndex === 'number' ? b.slotIndex : -1;
                  return bIdx - aIdx; // Get the last one before newSlotIndex
                })[0];
              
              if (referenceAppointment && typeof referenceAppointment.sessionIndex === 'number') {
                sessionIndexForNewSlot = referenceAppointment.sessionIndex;
              } else {
                // Fallback: use last slot's sessionIndex
                const lastSlot = slots[slots.length - 1];
                sessionIndexForNewSlot = lastSlot?.sessionIndex ?? 0;
              }
            }
            
            // Create synthetic schedule and assignment
            const syntheticAssignment: SchedulerAssignment = {
              id: '__new_walk_in__',
              slotIndex: newSlotIndex,
              sessionIndex: sessionIndexForNewSlot,
              slotTime: newSlotTime,
            };
            
            scheduleAttempt = {
              schedule: { assignments: [] },
              newAssignment: syntheticAssignment,
            };
            
            // Note: Bucket count is calculated on-the-fly, so we don't need to update Firestore
            // The bucket count will automatically decrease next time because we'll count one less
            // cancelled slot (since we're using one from the bucket)
            console.info('[Walk-in Scheduling] Using bucket slot, bucket count before:', firestoreBucketCount);
            console.info('[Walk-in Scheduling] Bucket compensation - final assignment:', {
              slotIndex: newSlotIndex,
              sessionIndex: syntheticAssignment.sessionIndex,
              slotTime: newSlotTime,
              maxSlotIndexUsed: maxSlotIndex,
            });
          }

          if (!scheduleAttempt) {
            throw new Error('Unable to schedule walk-in token.');
          }

          const finalSchedule = scheduleAttempt.schedule;
          const walkInAssignment = scheduleAttempt.newAssignment;

          // CRITICAL: Calculate walk-in time based on the slot at walkInAssignment.slotIndex
          // If the slot is within availability, use the slot's time directly
          // Otherwise, calculate based on previous appointment or scheduler time
          let calculatedWalkInTime: Date;
          const slotDuration = doctor.averageConsultingTime || 15;
          
          if (walkInAssignment.slotIndex < slots.length) {
            // Slot is within availability - use the slot's time directly (matches patient app)
            const slotMeta = slots[walkInAssignment.slotIndex];
            calculatedWalkInTime = slotMeta ? slotMeta.time : walkInAssignment.slotTime;
          } else {
            // Slot is outside availability - calculate based on previous appointment
            if (walkInAssignment.slotIndex > 0) {
              const appointmentBeforeWalkIn = effectiveAppointments
                .filter(appointment => 
                  appointment.bookedVia !== 'Walk-in' &&
                  typeof appointment.slotIndex === 'number' &&
                  appointment.slotIndex === walkInAssignment.slotIndex - 1 &&
                  ACTIVE_STATUSES.has(appointment.status)
                )
                .sort((a, b) => {
                  const aIdx = typeof a.slotIndex === 'number' ? a.slotIndex : -1;
                  const bIdx = typeof b.slotIndex === 'number' ? b.slotIndex : -1;
                  return bIdx - aIdx; // Get the last one at that slot (should be only one)
                })[0];
              
              if (appointmentBeforeWalkIn && appointmentBeforeWalkIn.time) {
                try {
                  const appointmentDate = parse(dateStr, 'd MMMM yyyy', date);
                  const previousAppointmentTime = parse(
                    appointmentBeforeWalkIn.time,
                    'hh:mm a',
                    appointmentDate
                  );
                  // Walk-in time = previous appointment time (for bucket slots outside availability)
                  calculatedWalkInTime = previousAppointmentTime;
                } catch (e) {
                  // If parsing fails, use scheduler's time
                  calculatedWalkInTime = walkInAssignment.slotTime;
                }
              } else {
                // No appointment before, use scheduler's time
                calculatedWalkInTime = walkInAssignment.slotTime;
              }
            } else {
              // slotIndex is 0, use scheduler's time
              calculatedWalkInTime = walkInAssignment.slotTime;
            }
          }

          const prepareAdvanceShift = async (
            targetSlotIndex: number,
            blockedSlots: Set<number>,
            advanceAssignments: Map<string, SchedulerAssignment>,
            walkInTime: Date,
            averageConsultingTime: number,
            existingReservations: Map<number, Date>
          ): Promise<{
            reservationDeletes: DocumentReference[];
            appointmentUpdates: Array<{
              appointmentId: string;
              docRef: DocumentReference;
              slotIndex: number;
              sessionIndex: number;
              timeString: string;
              noShowTime: Date;
            }>;
            updatedAdvanceAppointments: Appointment[];
          }> => {
            if (targetSlotIndex < 0 || targetSlotIndex >= totalSlots) {
              throw new Error('No available slots match the booking rules.');
            }

            const reservationDeletes: DocumentReference[] = [];
            const appointmentUpdates: Array<{
              appointmentId: string;
              docRef: DocumentReference;
              slotIndex: number;
              sessionIndex: number;
              timeString: string;
              noShowTime: Date;
            }> = [];

            const updatedAdvanceMap = new Map<string, Appointment>(
              activeAdvanceAppointments.map(appointment => [appointment.id, { ...appointment }])
            );

            const advanceOccupancy: (Appointment | null)[] = new Array(totalSlots).fill(null);
            activeAdvanceAppointments.forEach(appointment => {
              const idx = typeof appointment.slotIndex === 'number' ? appointment.slotIndex : -1;
              if (idx >= 0 && idx < totalSlots) {
                advanceOccupancy[idx] = appointment;
              }
            });

            const targetReservationRef = doc(
              db,
              'slot-reservations',
              buildReservationDocId(clinicId, doctorName, dateStr, targetSlotIndex)
            );
            // CRITICAL: Use existingReservations map instead of reading again
            // We already read all reservations before deleting stale ones
            // Reading again here would violate "all reads before all writes" rule
            if (existingReservations.has(targetSlotIndex)) {
              reservationDeletes.push(targetReservationRef);
            }

            // CRITICAL: Only shift appointments if the walk-in slot is actually occupied
            // If the slot is empty (reserved for walk-ins), no shifting is needed
            const targetAdvanceAppointment = advanceOccupancy[targetSlotIndex];
            const isSlotOccupied = targetAdvanceAppointment !== null || 
                                   activeWalkIns.some(w => typeof w.slotIndex === 'number' && w.slotIndex === targetSlotIndex);
            
            if (!isSlotOccupied) {
              // Slot is empty - no shifting needed
              return {
                reservationDeletes,
                appointmentUpdates,
                updatedAdvanceAppointments: activeAdvanceAppointments.map(appointment => {
                  return updatedAdvanceMap.get(appointment.id) ?? appointment;
                }),
              };
            }

            const appointmentsToReassign: Appointment[] = [];
            for (let idx = targetSlotIndex; idx < totalSlots; idx += 1) {
              const appointmentAtIndex = advanceOccupancy[idx];
              if (appointmentAtIndex) {
                appointmentsToReassign.push(appointmentAtIndex);
                advanceOccupancy[idx] = null;
              }
            }

            if (appointmentsToReassign.length === 0) {
              return {
                reservationDeletes,
                appointmentUpdates,
                updatedAdvanceAppointments: activeAdvanceAppointments.map(appointment => {
                  return updatedAdvanceMap.get(appointment.id) ?? appointment;
                }),
              };
            }

            // Get the time of the appointment before the walk-in (or walk-in time if targetSlotIndex is 0)
            // This will be used to calculate the first moved appointment's time
            let previousAppointmentTime: Date;
            if (targetSlotIndex > 0) {
              const appointmentBeforeWalkIn = advanceOccupancy[targetSlotIndex - 1];
              if (appointmentBeforeWalkIn && appointmentBeforeWalkIn.time) {
                // Parse the appointment time string to Date using date-fns parse
                try {
                  previousAppointmentTime = parse(
                    appointmentBeforeWalkIn.time,
                    'hh:mm a',
                    date
                  );
                } catch (e) {
                  // If parsing fails, use walk-in time
                  previousAppointmentTime = walkInTime;
                }
              } else {
                // No appointment before, use walk-in time
                previousAppointmentTime = walkInTime;
              }
            } else {
              // targetSlotIndex is 0, use walk-in time
              previousAppointmentTime = walkInTime;
              }

            // CRITICAL: For W booking, simply increment slotIndex by 1 for each appointment being shifted
            // Sort appointments by their current slotIndex to process them in order
            const sortedAppointmentsToReassign = appointmentsToReassign.sort((a, b) => {
              const aIdx = typeof a.slotIndex === 'number' ? a.slotIndex : -1;
              const bIdx = typeof b.slotIndex === 'number' ? b.slotIndex : -1;
              return aIdx - bIdx;
            });

            for (const appointmentToMove of sortedAppointmentsToReassign) {
              const currentSlotIndex = typeof appointmentToMove.slotIndex === 'number' ? appointmentToMove.slotIndex : -1;
              // CRITICAL: Increment slotIndex by 1 for each appointment being shifted
              const newSlotIndex = currentSlotIndex + 1;
              
              // Find the sessionIndex for the new slotIndex
              const newSlotMeta = slots[newSlotIndex];
              if (!newSlotMeta) {
                // If slot doesn't exist, skip this appointment (shouldn't happen, but safety check)
                console.warn(`[BOOKING DEBUG] Slot ${newSlotIndex} does not exist, skipping appointment ${appointmentToMove.id}`);
                continue;
                }
              const newSessionIndex = newSlotMeta.sessionIndex;

              const reservationRefForSlot = doc(
                db,
                'slot-reservations',
                buildReservationDocId(clinicId, doctorName, dateStr, newSlotIndex)
              );
              // CRITICAL: Use existingReservations map instead of reading again
              // We already read all reservations before deleting stale ones
              // Reading again here would violate "all reads before all writes" rule
              if (existingReservations.has(newSlotIndex)) {
                reservationDeletes.push(reservationRefForSlot);
              }

              // CRITICAL: Calculate new time from appointment's current time field + averageConsultingTime
              // Parse the appointment's current time field and add averageConsultingTime to it
              let newAppointmentTime: Date;
              if (appointmentToMove.time) {
                try {
                  const appointmentDate = parse(dateStr, 'd MMMM yyyy', new Date());
                  const currentAppointmentTime = parse(appointmentToMove.time, 'hh:mm a', appointmentDate);
                  // New time = current time + averageConsultingTime
                  newAppointmentTime = addMinutes(currentAppointmentTime, averageConsultingTime);
                } catch (e) {
                  console.warn(`[BOOKING DEBUG] Failed to parse appointment time "${appointmentToMove.time}" for appointment ${appointmentToMove.id}, skipping time update`);
                  continue;
                }
              } else {
                console.warn(`[BOOKING DEBUG] Appointment ${appointmentToMove.id} has no time field, skipping time update`);
                continue;
              }
              
              const timeString = format(newAppointmentTime, 'hh:mm a');
              
              // CRITICAL: Calculate new noShowTime from appointment's current noShowTime field + averageConsultingTime
              // Parse the appointment's current noShowTime field and add averageConsultingTime to it
              let noShowTime: Date;
              if (appointmentToMove.noShowTime) {
                try {
                  let currentNoShowTime: Date;
                  if (appointmentToMove.noShowTime instanceof Date) {
                    currentNoShowTime = appointmentToMove.noShowTime;
                  } else if (typeof appointmentToMove.noShowTime === 'object' && appointmentToMove.noShowTime !== null) {
                    const noShowTimeObj = appointmentToMove.noShowTime as { toDate?: () => Date; seconds?: number };
                    if (typeof noShowTimeObj.toDate === 'function') {
                      currentNoShowTime = noShowTimeObj.toDate();
                    } else if (typeof noShowTimeObj.seconds === 'number') {
                      currentNoShowTime = new Date(noShowTimeObj.seconds * 1000);
                    } else {
                      // Fallback to using new appointment time + averageConsultingTime
                      currentNoShowTime = addMinutes(newAppointmentTime, averageConsultingTime);
                    }
                  } else {
                    // Fallback to using new appointment time + averageConsultingTime
                    currentNoShowTime = addMinutes(newAppointmentTime, averageConsultingTime);
                  }
                  // New noShowTime = current noShowTime + averageConsultingTime
                  noShowTime = addMinutes(currentNoShowTime, averageConsultingTime);
                } catch (e) {
                  // If parsing fails, use new appointment time + averageConsultingTime
                  noShowTime = addMinutes(newAppointmentTime, averageConsultingTime);
                }
              } else {
                // No noShowTime available, use new appointment time + averageConsultingTime
                noShowTime = addMinutes(newAppointmentTime, averageConsultingTime);
              }

              // CRITICAL: Always update if slotIndex changed OR time changed
              // Don't skip updates when slotIndex changes, even if time happens to match
              const slotIndexChanged = currentSlotIndex !== newSlotIndex;
              const timeChanged = appointmentToMove.time !== timeString;
              
              if (!slotIndexChanged && !timeChanged) {
                // Only skip if both slotIndex and time are unchanged
                continue;
              }

              const appointmentRef = doc(db, 'appointments', appointmentToMove.id);
              appointmentUpdates.push({
                appointmentId: appointmentToMove.id,
                docRef: appointmentRef,
                slotIndex: newSlotIndex,
                sessionIndex: newSessionIndex,
                timeString,
                noShowTime,
              });
              
              console.info(`[BOOKING DEBUG] Updating appointment ${appointmentToMove.id}`, {
                slotIndexChanged,
                timeChanged,
                oldSlotIndex: currentSlotIndex,
                newSlotIndex,
                oldTime: appointmentToMove.time,
                newTime: timeString,
              });

              const cloned = updatedAdvanceMap.get(appointmentToMove.id);
              if (cloned) {
                cloned.slotIndex = newSlotIndex;
                cloned.sessionIndex = newSessionIndex;
                cloned.time = timeString;
                cloned.noShowTime = noShowTime;
              }
            }

            return {
              reservationDeletes,
              appointmentUpdates,
              updatedAdvanceAppointments: activeAdvanceAppointments.map(appointment => {
                return updatedAdvanceMap.get(appointment.id) ?? appointment;
              }),
            };
          };

          // Only prepare advance shift if we're not using cancelled slot directly or bucket
          // (cancelled slot is already free, bucket creates slot outside availability)
          let shiftPlan: {
            reservationDeletes: DocumentReference[];
            appointmentUpdates: Array<{
              appointmentId: string;
              docRef: DocumentReference;
              slotIndex: number;
              sessionIndex: number;
              timeString: string;
              noShowTime: Date;
            }>;
            updatedAdvanceAppointments: Appointment[];
          };
          
          if (usedCancelledSlot !== null || usedBucket) {
            // Using cancelled slot directly or bucket - no shift needed
            // Create empty shift plan
            // If bucket was used, add the bucket reservation to cleanup list
            const reservationDeletes: DocumentReference[] = [];
            if (usedBucket && bucketReservationRef) {
              reservationDeletes.push(bucketReservationRef);
            }
            shiftPlan = {
              reservationDeletes,
              appointmentUpdates: [],
              updatedAdvanceAppointments: activeAdvanceAppointments,
            };
              } else {
            // Normal scheduling - may need to shift advance appointments
            const advanceIds = new Set(activeAdvanceAppointments.map(appointment => appointment.id));
            const plannedWalkInSlots = new Set<number>(
              finalSchedule.assignments
                .filter(assignment => !advanceIds.has(assignment.id))
                .map(assignment => assignment.slotIndex)
                .filter(slotIndex => typeof slotIndex === 'number' && slotIndex >= 0)
            );
            const advanceAssignments = new Map<string, SchedulerAssignment>();
            for (const assignment of finalSchedule.assignments) {
              if (advanceIds.has(assignment.id)) {
                advanceAssignments.set(assignment.id, assignment);
              }
            }

            shiftPlan = await prepareAdvanceShift(
              walkInAssignment.slotIndex,
              new Set<number>(plannedWalkInSlots),
              advanceAssignments,
              calculatedWalkInTime,
              doctor.averageConsultingTime || 15,
              existingReservations
            );

            activeAdvanceAppointments = shiftPlan.updatedAdvanceAppointments;
          }

          const assignmentById = new Map(finalSchedule.assignments.map(assignment => [assignment.id, assignment]));

          const uniqueReservationDeletes = new Map<string, DocumentReference>();
          for (const ref of shiftPlan.reservationDeletes) {
            uniqueReservationDeletes.set(ref.path, ref);
          }
          for (const ref of uniqueReservationDeletes.values()) {
            transaction.delete(ref);
          }

          for (const updateOp of shiftPlan.appointmentUpdates) {
            transaction.update(updateOp.docRef, {
              slotIndex: updateOp.slotIndex,
              sessionIndex: updateOp.sessionIndex,
              time: updateOp.timeString,
              noShowTime: updateOp.noShowTime,
              // CRITICAL: cutOffTime is NOT updated - it remains the same as the original appointment
            });

            const advanceRecord = activeAdvanceAppointments.find(item => item.id === updateOp.appointmentId);
            if (advanceRecord) {
              advanceRecord.slotIndex = updateOp.slotIndex;
              advanceRecord.sessionIndex = updateOp.sessionIndex;
              advanceRecord.time = updateOp.timeString;
              advanceRecord.noShowTime = updateOp.noShowTime;
            }
          }

          // Only update existing walk-ins if we're using normal scheduling
          // (bucket and cancelled slot direct use don't have valid schedules for existing walk-ins)
          if (!usedBucket && usedCancelledSlot === null) {
            for (const appointment of activeWalkIns) {
              const assignment = assignmentById.get(appointment.id);
              if (!assignment) continue;

              const currentSlotIndex = typeof appointment.slotIndex === 'number' ? appointment.slotIndex : -1;
              const newSlotIndex = assignment.slotIndex;
              const newTimeString = format(assignment.slotTime, 'hh:mm a');
              const noShowTime = addMinutes(assignment.slotTime, averageConsultingTime);

              if (currentSlotIndex === newSlotIndex && appointment.time === newTimeString) {
                continue;
              }

              const appointmentRef = doc(db, 'appointments', appointment.id);
              transaction.update(appointmentRef, {
                slotIndex: newSlotIndex,
                sessionIndex: assignment.sessionIndex,
                time: newTimeString,
                noShowTime,
              });
              appointment.slotIndex = newSlotIndex;
              appointment.sessionIndex = assignment.sessionIndex;
              appointment.time = newTimeString;
              appointment.noShowTime = noShowTime;
            }
          }

          // Handle slot assignment based on how we scheduled
          // CRITICAL: Use calculated walk-in time (uses slot time when within availability, previous appointment time for bucket slots)
          if (usedCancelledSlot !== null) {
            // Case 1: First walk-in using cancelled slot directly - reuse the slotIndex
            chosenSlotIndex = usedCancelledSlot;
            const cancelledSlot = slots[usedCancelledSlot];
            sessionIndexForNew = cancelledSlot?.sessionIndex ?? walkInAssignment.sessionIndex;
            // Use calculated time, but fallback to cancelled slot time if calculation failed
            resolvedTimeString = format(calculatedWalkInTime, 'hh:mm a');
          } else if (usedBucket) {
            // Case 2: Bucket used (all slots filled) - use synthetic assignment
            // The synthetic assignment was already created with correct slotIndex and time
            chosenSlotIndex = walkInAssignment.slotIndex;
            sessionIndexForNew = walkInAssignment.sessionIndex;
            resolvedTimeString = format(calculatedWalkInTime, 'hh:mm a');
          } else {
            // Case 3: Normal scheduling - use assigned slot
            chosenSlotIndex = walkInAssignment.slotIndex;
            sessionIndexForNew = walkInAssignment.sessionIndex;
            resolvedTimeString = format(calculatedWalkInTime, 'hh:mm a');
          }
          
          // Create reservation using the final chosenSlotIndex
          const reservationId = buildReservationDocId(clinicId, doctorName, dateStr, chosenSlotIndex);
          const reservationDocRef = doc(db, 'slot-reservations', reservationId);
          
          // CRITICAL: Check existingReservations map (already read at the beginning)
          // This avoids violating Firestore's "all reads before all writes" transaction rule
          if (existingReservations.has(chosenSlotIndex)) {
            // Recent reservation exists - conflict
            const conflictError = new Error('slot-reservation-conflict');
            (conflictError as { code?: string }).code = 'slot-reservation-conflict';
            throw conflictError;
          }
          // If not in existingReservations, either:
          // 1. It doesn't exist (proceed)
          // 2. It was stale and already deleted (proceed)
          // Note: The reservation was already read in the initial loop,
          // so transaction.set() is safe here
          
          reservationRef = reservationDocRef;
        } else {
          const occupiedSlots = buildOccupiedSlotSet(effectiveAppointments);
          const candidates = buildCandidateSlots(type, slots, now, occupiedSlots, appointmentData.slotIndex, {
            appointments: effectiveAppointments,
          });

          if (candidates.length === 0) {
            // If a preferred slot was provided, check if it's in a specific session
            if (typeof appointmentData.slotIndex === 'number') {
              const preferredSlot = slots[appointmentData.slotIndex];
              const sessionIndex = preferredSlot?.sessionIndex;
              throw new Error(
                `No available slots in session ${typeof sessionIndex === 'number' ? sessionIndex + 1 : 'selected'}. ` +
                `All slots in this session are either booked or reserved for walk-ins. Please select a different time slot.`
              );
            }
            throw new Error('No available slots match the booking rules.');
          }

          for (const slotIndex of candidates) {
            if (occupiedSlots.has(slotIndex)) {
              console.log(`[BOOKING DEBUG] Slot ${slotIndex} already occupied in appointments list`);
              continue;
            }

            // CRITICAL: Double-check that this slot is NOT reserved for walk-ins (last 15% of FUTURE slots in its session)
            // This check happens inside the transaction to prevent race conditions
            // Even if buildCandidateSlots included it (shouldn't happen), we reject it here
            const reservedWSlots = calculatePerSessionReservedSlots(slots, now);
            if (type === 'A' && reservedWSlots.has(slotIndex)) {
              const slot = slots[slotIndex];
              console.error(`[BOOKING DEBUG] Request ${requestId}: ⚠️ REJECTED - Slot ${slotIndex} is reserved for walk-ins in session ${slot?.sessionIndex}`, {
                slotIndex,
                sessionIndex: slot?.sessionIndex,
                type,
                timestamp: new Date().toISOString()
              });
              continue; // NEVER allow advance bookings to use reserved walk-in slots
            }

            const reservationId = buildReservationDocId(clinicId, doctorName, dateStr, slotIndex);
            const reservationDocRef = doc(db, 'slot-reservations', reservationId);
            
            // CRITICAL: Check reservation inside transaction - this ensures we see the latest state
            // We MUST read the reservation document as part of the transaction's read set
            // so Firestore can detect conflicts when multiple transactions try to create it
            console.log(`[BOOKING DEBUG] Attempt ${attempt + 1}: Checking reservation for slot ${slotIndex}`, {
              reservationId,
              timestamp: new Date().toISOString(),
              transactionId: `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            });
            
            const reservationSnapshot = await transaction.get(reservationDocRef);

            if (reservationSnapshot.exists()) {
              const reservationData = reservationSnapshot.data();
              const reservedAt = reservationData?.reservedAt;
              
              // Check if reservation is stale (older than 30 seconds)
              // Stale reservations may be from failed booking attempts that didn't complete
              let isStale = false;
              if (reservedAt) {
                try {
                  let reservedTime: Date | null = null;
                  // Handle Firestore Timestamp objects (has toDate method)
                  if (typeof reservedAt.toDate === 'function') {
                    reservedTime = reservedAt.toDate();
                  } else if (reservedAt instanceof Date) {
                    reservedTime = reservedAt;
                  } else if (reservedAt.seconds) {
                    // Handle Timestamp-like object with seconds property
                    reservedTime = new Date(reservedAt.seconds * 1000);
                  }
                  
                  if (reservedTime) {
                    const now = new Date();
                    const ageInSeconds = (now.getTime() - reservedTime.getTime()) / 1000;
                    isStale = ageInSeconds > 30; // 30 second threshold for stale reservations
                  }
                } catch (e) {
                  // If we can't parse the timestamp, assume it's not stale
                  console.warn(`[BOOKING DEBUG] Could not parse reservedAt timestamp`, e);
                  isStale = false;
                }
              }
              
              if (isStale) {
                // Reservation is stale - clean it up and allow new booking
                console.log(`[BOOKING DEBUG] Slot ${slotIndex} has STALE reservation - cleaning up`, {
                reservationId,
                  reservedAt: reservedAt?.toDate?.()?.toISOString(),
                  existingData: reservationData
                });
                // Delete the stale reservation within the transaction
                transaction.delete(reservationDocRef);
                // Continue to create new reservation below
              } else {
                // Reservation exists and is not stale - another active transaction has it
                console.log(`[BOOKING DEBUG] Slot ${slotIndex} reservation already exists (not stale) - skipping`, {
                  reservationId,
                  reservedAt: reservedAt?.toDate?.()?.toISOString(),
                  existingData: reservationData
              });
              continue;
              }
            }

            // Double-check: Also verify no active appointment exists at this slotIndex
            // Re-check appointments inside transaction to see latest state
            const hasActiveAppointmentAtSlot = effectiveAppointments.some(
              apt => apt.slotIndex === slotIndex && ACTIVE_STATUSES.has(apt.status)
            );
            
            if (hasActiveAppointmentAtSlot) {
              console.log(`[BOOKING DEBUG] Slot ${slotIndex} has active appointment - skipping`);
              continue;
            }

            console.log(`[BOOKING DEBUG] Attempt ${attempt + 1}: Attempting to CREATE reservation for slot ${slotIndex}`, {
              reservationId,
              timestamp: new Date().toISOString(),
              candidatesCount: candidates.length,
              currentSlotIndex: slotIndex
            });

            // CRITICAL: Reserve the slot atomically using transaction.set()
            // By reading the document first with transaction.get(), we add it to the transaction's read set
            // If another transaction also reads it (doesn't exist) and tries to set() it:
            // - Firestore will detect the conflict (both read the same document)
            // - One transaction will succeed, others will fail with "failed-precondition"
            // - Failed transactions will be retried, and on retry they'll see the reservation exists
            // This ensures only ONE reservation can be created per slot, even with concurrent requests
            transaction.set(reservationDocRef, {
        clinicId,
        doctorName,
        date: dateStr,
              slotIndex: slotIndex,
        reservedAt: serverTimestamp(),
              reservedBy: 'appointment-booking',
            });
            
            console.log(`[BOOKING DEBUG] Attempt ${attempt + 1}: Reservation SET in transaction for slot ${slotIndex}`, {
              reservationId,
              timestamp: new Date().toISOString()
            });
            
            // Store the reservation reference - we've successfully reserved this slot
            // If the transaction commits, this reservation will exist
            // If it fails, it will be retried and try the next slot

            reservationRef = reservationDocRef;
            chosenSlotIndex = slotIndex;
            const reservedSlot = slots[chosenSlotIndex];
            sessionIndexForNew = reservedSlot?.sessionIndex ?? 0;
            resolvedTimeString = format(reservedSlot?.time ?? now, 'hh:mm a');
            
            // CRITICAL: Token number MUST be based on slotIndex + 1 (slotIndex is 0-based, tokens are 1-based)
            // This ensures token A001 goes to slot #1 (slotIndex 0), A002 to slot #2 (slotIndex 1), etc.
            // This makes token numbers correspond to slot positions, not sequential booking order
            // DO NOT use counterState.nextNumber - always use slotIndex + 1
            // Calculate token IMMEDIATELY after reserving slot to ensure atomicity
            const calculatedNumericToken = chosenSlotIndex + 1;
            const calculatedTokenNumber = `A${String(calculatedNumericToken).padStart(3, '0')}`;
            
            // Force assignment - don't allow any other value
            numericToken = calculatedNumericToken;
            tokenNumber = calculatedTokenNumber;
            
          console.log(`[BOOKING DEBUG] Request ${requestId}: Token assigned based on slotIndex`, {
            slotIndex: chosenSlotIndex,
            calculatedNumericToken,
            calculatedTokenNumber,
            assignedNumericToken: numericToken,
            assignedTokenNumber: tokenNumber,
            counterNextNumber: counterState?.nextNumber ?? 'N/A (not used for advance bookings)', // For debugging - should NOT be used
            timestamp: new Date().toISOString()
          });
            
            // Verify assignment was successful
            if (numericToken !== calculatedNumericToken || tokenNumber !== calculatedTokenNumber) {
              console.error(`[BOOKING DEBUG] Request ${requestId}: ⚠️ TOKEN ASSIGNMENT FAILED`, {
                slotIndex: chosenSlotIndex,
                expectedNumericToken: calculatedNumericToken,
                actualNumericToken: numericToken,
                expectedTokenNumber: calculatedTokenNumber,
                actualTokenNumber: tokenNumber,
                timestamp: new Date().toISOString()
              });
              // Force correct values
              numericToken = calculatedNumericToken;
              tokenNumber = calculatedTokenNumber;
            }
            
            break;
          }

          if (chosenSlotIndex < 0 || !reservationRef) {
            throw new Error('No available slots match the booking rules.');
          }
        }

        // CRITICAL: Ensure token is ALWAYS assigned based on slotIndex for advance bookings
        // This is a safety check in case the token wasn't assigned in the loop
        if (type === 'A' && chosenSlotIndex >= 0) {
          const expectedNumericToken = chosenSlotIndex + 1;
          const expectedTokenNumber = `A${String(expectedNumericToken).padStart(3, '0')}`;

          if (numericToken !== expectedNumericToken || tokenNumber !== expectedTokenNumber) {
            console.warn(`[BOOKING DEBUG] Request ${requestId}: Token not properly assigned in loop - fixing now`, {
              slotIndex: chosenSlotIndex,
              currentNumericToken: numericToken,
              expectedNumericToken,
              currentTokenNumber: tokenNumber,
              expectedTokenNumber,
              timestamp: new Date().toISOString()
            });
            numericToken = expectedNumericToken;
            tokenNumber = expectedTokenNumber;
          }
        }

        if (!reservationRef) {
          throw new Error('Failed to reserve slot.');
        }

        transaction.set(reservationRef, {
        clinicId,
        doctorName,
        date: dateStr,
          slotIndex: chosenSlotIndex,
        reservedAt: serverTimestamp(),
          reservedBy: type === 'W' ? 'walk-in-booking' : 'appointment-booking',
        });
        
        // CRITICAL: Only increment counter for walk-ins, not for advance bookings
        // Advance bookings use slotIndex + 1 for tokens, so counter is not needed
        // Incrementing counter for advance bookings causes counter drift and potential token mismatches
        if (type === 'W' && counterState) {
        commitNextTokenNumber(transaction, counterRef, counterState);
        }

        // CRITICAL: Ensure token matches slotIndex before returning
        // This is a final safety check to prevent token/slotIndex mismatches
        if (type === 'A' && chosenSlotIndex >= 0) {
          const expectedNumericToken = chosenSlotIndex + 1;
          const expectedTokenNumber = `A${String(expectedNumericToken).padStart(3, '0')}`;
          
          if (numericToken !== expectedNumericToken || tokenNumber !== expectedTokenNumber) {
            console.error(`[BOOKING DEBUG] Request ${requestId}: ⚠️ TOKEN MISMATCH DETECTED - Correcting`, {
              slotIndex: chosenSlotIndex,
              currentNumericToken: numericToken,
              expectedNumericToken,
              currentTokenNumber: tokenNumber,
              expectedTokenNumber,
              timestamp: new Date().toISOString()
            });
            numericToken = expectedNumericToken;
            tokenNumber = expectedTokenNumber;
          }
        }

        console.log(`[BOOKING DEBUG] Request ${requestId}: Transaction SUCCESS - about to commit`, {
          tokenNumber,
          numericToken,
          slotIndex: chosenSlotIndex,
          reservationId: reservationRef.id,
          tokenMatchesSlot: type === 'A' ? numericToken === chosenSlotIndex + 1 : true,
          timestamp: new Date().toISOString()
        });
    
    return { 
      tokenNumber, 
      numericToken, 
          slotIndex: chosenSlotIndex,
          sessionIndex: sessionIndexForNew,
          time: resolvedTimeString,
          reservationId: reservationRef.id,
    };
  });
    } catch (error) {
      const errorDetails = {
        requestId,
        attempt: attempt + 1,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: (error as { code?: string }).code,
        errorName: error instanceof Error ? error.name : undefined,
        timestamp: new Date().toISOString()
      };

      console.error(`[BOOKING DEBUG] Request ${requestId}: Transaction FAILED (attempt ${attempt + 1})`, errorDetails);

      if (isReservationConflict(error)) {
        console.log(`[BOOKING DEBUG] Request ${requestId}: Reservation conflict detected - will retry`, {
          isReservationConflict: true,
          attemptsRemaining: MAX_TRANSACTION_ATTEMPTS - attempt - 1
        });
        if (attempt < MAX_TRANSACTION_ATTEMPTS - 1) {
          continue;
        }
      }
      
      console.error(`[BOOKING DEBUG] Request ${requestId}: Transaction failed and will NOT retry`, errorDetails);
      throw error;
    }
  }

  console.error(`[BOOKING DEBUG] Request ${requestId}: All ${MAX_TRANSACTION_ATTEMPTS} attempts exhausted`);

  throw new Error('No available slots match the booking rules.');
}

// Removed updateCancelledBucketCount - bucket count is now calculated on-the-fly from appointments
// No need to store it in Firestore, which avoids permission issues and keeps it always accurate

export async function rebalanceWalkInSchedule(
  clinicId: string,
  doctorName: string,
  date: Date,
  doctorId?: string
): Promise<void> {
  const now = new Date();
  const clinicSnap = await getDoc(doc(db, 'clinics', clinicId));
  const rawSpacing = clinicSnap.exists() ? Number(clinicSnap.data()?.walkInTokenAllotment ?? 0) : 0;
  const walkInSpacingValue = Number.isFinite(rawSpacing) && rawSpacing > 0 ? Math.floor(rawSpacing) : 0;

  const { doctor, slots } = await loadDoctorAndSlots(clinicId, doctorName, date, doctorId);
  const appointments = await fetchDayAppointments(clinicId, doctorName, date);
  const averageConsultingTime = doctor.averageConsultingTime || 15;

  const activeAdvanceAppointments = appointments.filter(appointment => {
    return (
      appointment.bookedVia !== 'Walk-in' &&
      typeof appointment.slotIndex === 'number' &&
      ACTIVE_STATUSES.has(appointment.status)
    );
  });

  const activeWalkIns = appointments.filter(appointment => {
    return (
      appointment.bookedVia === 'Walk-in' &&
      typeof appointment.slotIndex === 'number' &&
      ACTIVE_STATUSES.has(appointment.status)
    );
  });

  if (activeWalkIns.length === 0) {
    return;
  }

  await runTransaction(db, async transaction => {
    const advanceRefs = activeAdvanceAppointments.map(appointment => doc(db, 'appointments', appointment.id));
    const walkInRefs = activeWalkIns.map(appointment => doc(db, 'appointments', appointment.id));

    const [advanceSnapshots, walkInSnapshots] = await Promise.all([
      Promise.all(advanceRefs.map(ref => transaction.get(ref))),
      Promise.all(walkInRefs.map(ref => transaction.get(ref))),
    ]);

    const freshAdvanceAppointments = advanceSnapshots
      .filter(snapshot => snapshot.exists())
      .map(snapshot => {
        const data = snapshot.data() as Appointment;
        return { ...data, id: snapshot.id };
      })
      .filter(appointment => {
        return (
          appointment.bookedVia !== 'Walk-in' &&
          typeof appointment.slotIndex === 'number' &&
          ACTIVE_STATUSES.has(appointment.status)
        );
      });

    const freshWalkIns = walkInSnapshots
      .filter(snapshot => snapshot.exists())
      .map(snapshot => {
        const data = snapshot.data() as Appointment;
        return { ...data, id: snapshot.id };
      })
      .filter(appointment => {
        return (
          appointment.bookedVia === 'Walk-in' &&
          typeof appointment.slotIndex === 'number' &&
          ACTIVE_STATUSES.has(appointment.status)
        );
      });

    if (freshWalkIns.length === 0) {
      return;
    }

    const walkInCandidates = freshWalkIns.map(appointment => ({
      id: appointment.id,
      numericToken: typeof appointment.numericToken === 'number' ? appointment.numericToken : 0,
      createdAt: toDate(appointment.createdAt),
      currentSlotIndex: typeof appointment.slotIndex === 'number' ? appointment.slotIndex : undefined,
    }));

    const schedule = computeWalkInSchedule({
      slots,
      now,
      walkInTokenAllotment: walkInSpacingValue,
      advanceAppointments: freshAdvanceAppointments.map(entry => ({
        id: entry.id,
        slotIndex: typeof entry.slotIndex === 'number' ? entry.slotIndex : -1,
        status: entry.status === 'Confirmed' ? 'Confirmed' : 'Pending',
      })),
      walkInCandidates,
    });

    const assignmentById = new Map(schedule.assignments.map(assignment => [assignment.id, assignment]));

    for (const appointment of freshAdvanceAppointments) {
      const assignment = assignmentById.get(appointment.id);
      if (!assignment) continue;

      const currentSlotIndex = typeof appointment.slotIndex === 'number' ? appointment.slotIndex : -1;
      const newSlotIndex = assignment.slotIndex;
      const newTimeString = format(assignment.slotTime, 'hh:mm a');

      if (currentSlotIndex === newSlotIndex && appointment.time === newTimeString) {
        continue;
      }
      
      const appointmentRef = doc(db, 'appointments', appointment.id);
      transaction.update(appointmentRef, {
        slotIndex: newSlotIndex,
        sessionIndex: assignment.sessionIndex,
        time: newTimeString,
        cutOffTime: addMinutes(assignment.slotTime, -averageConsultingTime),
        noShowTime: addMinutes(assignment.slotTime, averageConsultingTime),
      });
    }

    for (const appointment of freshWalkIns) {
      const assignment = assignmentById.get(appointment.id);
      if (!assignment) continue;

      const currentSlotIndex = typeof appointment.slotIndex === 'number' ? appointment.slotIndex : -1;
      const newSlotIndex = assignment.slotIndex;
      const newTimeString = format(assignment.slotTime, 'hh:mm a');

      if (currentSlotIndex === newSlotIndex && appointment.time === newTimeString) {
        continue;
      }
      
      const appointmentRef = doc(db, 'appointments', appointment.id);
      transaction.update(appointmentRef, {
        slotIndex: newSlotIndex,
        sessionIndex: assignment.sessionIndex,
        time: newTimeString,
        cutOffTime: addMinutes(assignment.slotTime, -averageConsultingTime),
        noShowTime: addMinutes(assignment.slotTime, averageConsultingTime),
      });
    }
  });
}

export async function calculateWalkInDetails(
  clinicId: string,
  doctorName: string,
  doctor: Doctor,
  walkInTokenAllotment?: number,
  walkInCapacityThreshold: number = 0
): Promise<{
  estimatedTime: Date;
  patientsAhead: number;
  numericToken: number;
  slotIndex: number;
  sessionIndex: number;
  actualSlotTime: Date;
}> {
  const now = new Date();
  const date = now;
  
  // Fetch walkInTokenAllotment from database if not provided (same as generateNextTokenAndReserveSlot)
  let spacingValue = 0;
  if (walkInTokenAllotment !== undefined && Number.isFinite(walkInTokenAllotment) && walkInTokenAllotment > 0) {
    // Use provided value if valid
    spacingValue = Math.floor(walkInTokenAllotment);
  } else {
    // Fetch from database if not provided
    if (clinicId) {
      const clinicSnap = await getDoc(doc(db, 'clinics', clinicId));
      const rawSpacing = clinicSnap.exists() ? Number(clinicSnap.data()?.walkInTokenAllotment ?? 0) : 0;
      spacingValue = Number.isFinite(rawSpacing) && rawSpacing > 0 ? Math.floor(rawSpacing) : 0;
    }
  }

  const { slots } = await loadDoctorAndSlots(clinicId, doctorName, date, doctor.id);
  const appointments = await fetchDayAppointments(clinicId, doctorName, date);

  // Get all active advance appointments (including skipped) - now included in interval counting
  const activeAdvanceAppointments = appointments.filter(appointment => {
    return (
      appointment.bookedVia !== 'Walk-in' &&
      typeof appointment.slotIndex === 'number' &&
      ACTIVE_STATUSES.has(appointment.status)
    );
  });

  const activeWalkIns = appointments.filter(appointment => {
    return (
      appointment.bookedVia === 'Walk-in' &&
      typeof appointment.slotIndex === 'number' &&
      ACTIVE_STATUSES.has(appointment.status)
    );
  });

  const placeholderId = '__preview_walk_in__';
  const existingNumericTokens = activeWalkIns
    .map(appointment => {
      if (typeof appointment.numericToken === 'number') {
        return appointment.numericToken;
      }
      const parsed = Number(appointment.numericToken);
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .filter(token => token > 0);

  const placeholderNumericToken =
    (existingNumericTokens.length > 0 ? Math.max(...existingNumericTokens) : slots.length) + 1;

  const walkInCandidates = [
    ...activeWalkIns.map(appointment => ({
      id: appointment.id,
      numericToken: typeof appointment.numericToken === 'number' ? appointment.numericToken : 0,
      createdAt: toDate(appointment.createdAt),
      currentSlotIndex: typeof appointment.slotIndex === 'number' ? appointment.slotIndex : undefined,
    })),
    {
      id: placeholderId,
      numericToken: placeholderNumericToken,
      createdAt: now,
    },
  ];

  // Include all advance appointments (including skipped) in interval counting
  const advanceAppointmentsForScheduler = activeAdvanceAppointments.map(entry => ({
    id: entry.id,
    slotIndex: typeof entry.slotIndex === 'number' ? entry.slotIndex : -1,
  }));

  console.log('[WALK-IN DEBUG] calculateWalkInDetails - Before scheduler call', {
    activeAdvanceAppointmentsCount: activeAdvanceAppointments.length,
    activeAdvanceAppointments: activeAdvanceAppointments.map(apt => ({
      id: apt.id,
      tokenNumber: apt.tokenNumber,
      slotIndex: apt.slotIndex,
      status: apt.status,
      time: apt.time
    })),
    activeWalkInsCount: activeWalkIns.length,
    spacingValue,
    slotsCount: slots.length,
    placeholderNumericToken,
    timestamp: new Date().toISOString()
  });

  const schedule = computeWalkInSchedule({
    slots,
    now,
    walkInTokenAllotment: spacingValue,
    advanceAppointments: advanceAppointmentsForScheduler,
    walkInCandidates,
  });

  console.log('[WALK-IN DEBUG] Scheduler returned', {
    assignmentsCount: schedule.assignments.length,
    assignments: schedule.assignments.map(a => ({
      id: a.id,
      slotIndex: a.slotIndex,
      sessionIndex: a.sessionIndex,
      slotTime: a.slotTime.toISOString()
    })),
    timestamp: new Date().toISOString()
  });

  const assignment = schedule.assignments.find(entry => entry.id === placeholderId);

  if (!assignment) {
    throw new Error('No walk-in slots are available at this time.');
  }

  console.log('[WALK-IN DEBUG] Placeholder assignment found', {
    slotIndex: assignment.slotIndex,
    sessionIndex: assignment.sessionIndex,
    slotTime: assignment.slotTime.toISOString(),
    timestamp: new Date().toISOString()
  });

  // Count all appointments ahead with status Pending, Confirmed, Skipped, or Completed
  // that have a slotIndex less than the walk-in's assigned slotIndex
  const allActiveStatuses = new Set(['Pending', 'Confirmed', 'Skipped', 'Completed']);
  const appointmentsAhead = appointments.filter(appointment => {
    return (
      typeof appointment.slotIndex === 'number' &&
      appointment.slotIndex < assignment.slotIndex &&
      allActiveStatuses.has(appointment.status)
    );
  });
  
  const patientsAhead = appointmentsAhead.length;

  console.log('[WALK-IN DEBUG] Patients ahead calculation', {
    walkInSlotIndex: assignment.slotIndex,
    appointmentsAheadCount: patientsAhead,
    appointmentsAhead: appointmentsAhead.map(apt => ({
      id: apt.id,
      tokenNumber: apt.tokenNumber,
      slotIndex: apt.slotIndex,
      status: apt.status,
      time: apt.time
    })),
    allAppointments: appointments.map(apt => ({
      id: apt.id,
      tokenNumber: apt.tokenNumber,
      slotIndex: apt.slotIndex,
      status: apt.status,
      time: apt.time
    })),
    timestamp: new Date().toISOString()
  });

  const numericToken = placeholderNumericToken;

  return {
    estimatedTime: assignment.slotTime,
    patientsAhead,
    numericToken,
    slotIndex: assignment.slotIndex,
    sessionIndex: assignment.sessionIndex,
    actualSlotTime: assignment.slotTime,
  };
}

export async function calculateSkippedTokenRejoinSlot(
  appointment: Appointment,
  activeAppointments: Appointment[],
  doctor: Doctor,
  _recurrence: number = 0,
  referenceDate: Date = new Date()
): Promise<{ slotIndex: number; time: string; sessionIndex: number }>
{
  const clinicId = appointment.clinicId || doctor.clinicId || '';
  const doctorName = appointment.doctor || doctor.name;
  const { slots } = await loadDoctorAndSlots(
    clinicId,
    doctorName,
    referenceDate,
    doctor.id ?? appointment.doctorId
  );

  const filteredAppointments = activeAppointments.filter(a => a.id !== appointment.id);
  const occupiedSlots = buildOccupiedSlotSet(filteredAppointments);
  const candidates = buildCandidateSlots('W', slots, referenceDate, occupiedSlots);

  const slotIndex = candidates[0] ?? slots[slots.length - 1].index;
  const slot = slots.find(s => s.index === slotIndex) ?? slots[slots.length - 1];

  return {
    slotIndex: slot.index,
    time: format(slot.time, 'hh:mm a'),
    sessionIndex: slot.sessionIndex,
  };
}

export interface WalkInPreviewShift {
  id: string;
  tokenNumber?: string;
  fromSlot: number;
  toSlot: number;
  fromTime?: Date | null;
  toTime: Date;
}

export interface WalkInPreviewResult {
  placeholderAssignment: SchedulerAssignment | null;
  advanceShifts: WalkInPreviewShift[];
  walkInAssignments: SchedulerAssignment[];
}

export async function previewWalkInPlacement(
  clinicId: string,
  doctorName: string,
  date: Date,
  walkInTokenAllotment: number,
  doctorId?: string
): Promise<WalkInPreviewResult> {
  const DEBUG = process.env.NEXT_PUBLIC_DEBUG_WALK_IN === 'true';
  console.info('[Preview] previewWalkInPlacement called');
  const { slots } = await loadDoctorAndSlots(clinicId, doctorName, date, doctorId);
  const appointments = await fetchDayAppointments(clinicId, doctorName, date);
  console.info('[Preview] Loaded', appointments.length, 'appointments,', slots.length, 'slots');
  
  // Log all cancelled/no-show appointments
  const cancelledAppointments = appointments.filter(apt => 
    (apt.status === 'Cancelled' || apt.status === 'No-show') && 
    typeof apt.slotIndex === 'number'
  );
  console.info('[Preview] Cancelled/No-show appointments:', cancelledAppointments.map(apt => ({
    slotIndex: apt.slotIndex,
    status: apt.status,
    time: apt.time,
  })));

  const activeAdvanceAppointments = appointments.filter(appointment => {
    return (
      appointment.bookedVia !== 'Walk-in' &&
      typeof appointment.slotIndex === 'number' &&
      ACTIVE_STATUSES.has(appointment.status)
    );
  });

  const activeWalkIns = appointments.filter(appointment => {
    return (
      appointment.bookedVia === 'Walk-in' &&
      typeof appointment.slotIndex === 'number' &&
      ACTIVE_STATUSES.has(appointment.status)
    );
  });

  const existingNumericTokens = activeWalkIns
    .map(appointment => {
      if (typeof appointment.numericToken === 'number') {
        return appointment.numericToken;
      }
      const parsed = Number(appointment.numericToken);
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .filter(token => token > 0);

  const placeholderNumericToken =
    (existingNumericTokens.length > 0 ? Math.max(...existingNumericTokens) : slots.length) + 1;

  const placeholderId = '__preview_walk_in__';

  const walkInCandidates = [
    ...activeWalkIns.map(appointment => ({
      id: appointment.id,
      numericToken:
        typeof appointment.numericToken === 'number'
          ? appointment.numericToken
          : Number(appointment.numericToken ?? 0) || 0,
      createdAt: toDate(appointment.createdAt),
      currentSlotIndex: typeof appointment.slotIndex === 'number' ? appointment.slotIndex : undefined,
    })),
    {
      id: placeholderId,
      numericToken: placeholderNumericToken,
      createdAt: new Date(),
    },
  ];

  // Apply the same blocking logic as in generateNextTokenAndReserveSlot
  // Block cancelled slots that have walk-ins AFTER them
  const now = new Date();
  const oneHourAhead = addMinutes(now, 60);
  const hasExistingWalkIns = activeWalkIns.length > 0;
  
  // Build set of slots with active appointments
  const slotsWithActiveAppointments = new Set<number>();
  appointments.forEach(appt => {
    if (
      typeof appt.slotIndex === 'number' &&
      ACTIVE_STATUSES.has(appt.status)
    ) {
      slotsWithActiveAppointments.add(appt.slotIndex);
    }
  });
  
  // Get all active walk-ins with their slot times for comparison
  const activeWalkInsWithTimes = activeWalkIns
    .filter(appt => typeof appt.slotIndex === 'number')
    .map(appt => {
      const slotMeta = slots[appt.slotIndex!];
  return {
        appointment: appt,
        slotIndex: appt.slotIndex!,
        slotTime: slotMeta?.time,
      };
    })
    .filter(item => item.slotTime !== undefined);
  
  // Build set of cancelled slots in bucket (blocked from walk-in scheduling)
  // Only cancelled slots that have walk-ins AFTER them go to bucket
  const cancelledSlotsInBucket = new Set<number>();
  const allCancelledSlots: Array<{ slotIndex: number; slotTime: Date; hasWalkInsAfter: boolean }> = [];
  
  if (hasExistingWalkIns) {
    console.info('[Preview] Checking cancelled slots with', activeWalkInsWithTimes.length, 'existing walk-ins');
    console.info('[Preview] Existing walk-ins:', activeWalkInsWithTimes.map(w => ({ slotIndex: w.slotIndex, time: w.slotTime })));
    
    for (const appointment of appointments) {
      if (
        (appointment.status === 'Cancelled' || appointment.status === 'No-show') &&
        typeof appointment.slotIndex === 'number'
      ) {
        const slotMeta = slots[appointment.slotIndex];
        if (slotMeta) {
          const isInWindow = !isBefore(slotMeta.time, now) && !isAfter(slotMeta.time, oneHourAhead);
          const hasActiveAppt = slotsWithActiveAppointments.has(appointment.slotIndex);
          
          console.info(`[Preview] Cancelled slot ${appointment.slotIndex}:`, {
            time: slotMeta.time,
            isInWindow,
            hasActiveAppt,
            status: appointment.status,
          });
          
          if (
            isInWindow &&
            !hasActiveAppt
          ) {
            // Check if there are walk-ins scheduled AFTER this cancelled slot's time
            const hasWalkInsAfter = activeWalkInsWithTimes.some(
              walkIn => walkIn.slotTime && isAfter(walkIn.slotTime, slotMeta.time)
            );
            
            allCancelledSlots.push({
              slotIndex: appointment.slotIndex,
              slotTime: slotMeta.time,
              hasWalkInsAfter,
            });
            
            console.info(`[Preview] Cancelled slot ${appointment.slotIndex} (time: ${slotMeta.time}): hasWalkInsAfter=${hasWalkInsAfter}`);
            
            if (hasWalkInsAfter) {
              // This is a cancelled slot with walk-ins after it - block it from walk-in scheduling
              cancelledSlotsInBucket.add(appointment.slotIndex);
              console.warn(`[Preview] BLOCKING cancelled slot ${appointment.slotIndex} (has walk-ins after it)`);
    } else {
              console.info(`[Preview] NOT blocking cancelled slot ${appointment.slotIndex} (no walk-ins after it)`);
            }
      } else {
            console.info(`[Preview] Skipping cancelled slot ${appointment.slotIndex}: isInWindow=${isInWindow}, hasActiveAppt=${hasActiveAppt}`);
          }
        }
      }
      }
    } else {
    console.info('[Preview] No existing walk-ins, skipping bucket logic');
  }
  
  console.info('[Preview] All cancelled slots found:', allCancelledSlots);
  console.info('[Preview] Cancelled slots in bucket (blocked):', Array.from(cancelledSlotsInBucket));
  
  // Build blocked advance appointments (include cancelled slots in bucket)
  const blockedAdvanceAppointments = activeAdvanceAppointments.map(entry => ({
    id: entry.id,
    slotIndex: typeof entry.slotIndex === 'number' ? entry.slotIndex : -1,
  }));
  
  console.info('[Preview] Active advance appointments:', blockedAdvanceAppointments.length);
  
  // Add cancelled slots in bucket as blocked slots (treat as occupied)
  cancelledSlotsInBucket.forEach(slotIndex => {
    blockedAdvanceAppointments.push({
      id: `__blocked_cancelled_${slotIndex}`,
      slotIndex: slotIndex,
    });
    console.warn(`[Preview] Added blocked cancelled slot ${slotIndex} to advance appointments`);
  });
  
  console.info('[Preview] Total blocked advance appointments (including cancelled):', blockedAdvanceAppointments.length);
  console.info('[Preview] Blocked advance appointments:', blockedAdvanceAppointments.map(a => ({ id: a.id, slotIndex: a.slotIndex })));

  // Log before calling scheduler
  console.warn('[Preview] ABOUT TO CALL SCHEDULER with', blockedAdvanceAppointments.length, 'advance appointments');
  console.warn('[Preview] Blocked advance appointments details:', JSON.stringify(blockedAdvanceAppointments, null, 2));
  console.warn('[Preview] Cancelled slots in bucket:', Array.from(cancelledSlotsInBucket));
  console.warn('[Preview] Active walk-ins count:', activeWalkIns.length);
  console.warn('[Preview] Has existing walk-ins:', hasExistingWalkIns);
  
  const schedule = computeWalkInSchedule({
    slots,
    now: new Date(),
    walkInTokenAllotment,
    advanceAppointments: blockedAdvanceAppointments,
    walkInCandidates,
  });
  
  // Log after scheduler returns
  const placeholderAssignmentPreview = schedule.assignments.find(a => a.id === placeholderId);
  console.warn('[Preview] SCHEDULER RETURNED - placeholder assignment:', placeholderAssignmentPreview ? {
    slotIndex: placeholderAssignmentPreview.slotIndex,
    slotTime: placeholderAssignmentPreview.slotTime,
  } : 'NOT FOUND');
  
  if (placeholderAssignmentPreview && cancelledSlotsInBucket.has(placeholderAssignmentPreview.slotIndex)) {
    console.error('[Preview] ERROR: Scheduler assigned to blocked cancelled slot!', placeholderAssignmentPreview.slotIndex);
  }

  const assignmentById = new Map(schedule.assignments.map(assignment => [assignment.id, assignment]));

  const advanceShifts: WalkInPreviewShift[] = activeAdvanceAppointments.flatMap(appointment => {
    const assignment = assignmentById.get(appointment.id);
    if (!assignment) {
      return [];
    }
    const currentSlotIndex = typeof appointment.slotIndex === 'number' ? appointment.slotIndex : -1;
    if (currentSlotIndex === assignment.slotIndex) {
      return [];
    }

    const fromTime = currentSlotIndex >= 0 ? slots[currentSlotIndex]?.time ?? null : null;

    return [
      {
        id: appointment.id,
        tokenNumber: appointment.tokenNumber,
        fromSlot: currentSlotIndex,
        toSlot: assignment.slotIndex,
        fromTime,
        toTime: assignment.slotTime,
      },
    ];
  });

  const placeholderAssignment = assignmentById.get(placeholderId) ?? null;
  const walkInAssignments = schedule.assignments.filter(assignment => assignment.id !== placeholderId);

  if (DEBUG) {
    console.group('[clinic admin walk-in preview]');
    console.info('placeholder', placeholderAssignment);
    console.info('advance shifts', advanceShifts);
    console.info('walk-in assignments', walkInAssignments);
    console.groupEnd();
  }

  return { placeholderAssignment, advanceShifts, walkInAssignments };
}