import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
  type Transaction,
} from 'firebase/firestore';
import { format, addMinutes, isAfter, isBefore } from 'date-fns';
import type { Doctor, Appointment } from '@/lib/types';
import { parseTime as parseTimeString } from '@/lib/utils';

const ACTIVE_STATUSES = new Set(['Pending', 'Confirmed']);
const MAX_RESERVATION_ATTEMPTS = 5;
const RESERVATION_CONFLICT_CODE = 'slot-reservation-conflict';

function isReservationConflict(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message === RESERVATION_CONFLICT_CODE ||
    (typeof (error as { code?: string }).code === 'string' &&
      (error as { code?: string }).code === RESERVATION_CONFLICT_CODE)
  );
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

  const addCandidate = (slotIndex: number) => {
    if (
      slotIndex >= 0 &&
      slotIndex < slots.length &&
      !occupied.has(slotIndex) &&
      !candidates.includes(slotIndex)
    ) {
      candidates.push(slotIndex);
    }
  };

  if (type === 'A') {
    if (typeof preferredSlotIndex === 'number') {
      const slotTime = getSlotTime(slots, preferredSlotIndex);
      if (isAfter(slotTime, oneHourFromNow)) {
        addCandidate(preferredSlotIndex);
      }
    }

    slots.forEach(slot => {
      if (isAfter(slot.time, oneHourFromNow)) {
        addCandidate(slot.index);
      }
    });
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
): Promise<{ tokenNumber: string; numericToken: number; slotIndex: number; time: string; reservationId: string }>
{
  const dateStr = format(date, 'd MMMM yyyy');
  const now = new Date();
  const counterDocId = `${clinicId}_${doctorName}_${dateStr}${type === 'W' ? '_W' : ''}`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
  const counterRef = doc(db, 'token-counters', counterDocId);
  let walkInSpacing: number | undefined;

  if (type === 'W') {
    const clinicSnap = await getDoc(doc(db, 'clinics', clinicId));
    const rawSpacing = clinicSnap.exists() ? Number(clinicSnap.data()?.walkInTokenAllotment ?? 0) : 0;
    walkInSpacing = Number.isFinite(rawSpacing) && rawSpacing > 0 ? rawSpacing : undefined;
  }

  const { slots } = await loadDoctorAndSlots(
    clinicId,
    doctorName,
    date,
    typeof appointmentData.doctorId === 'string' ? appointmentData.doctorId : undefined
  );
  const totalSlots = slots.length;
  const minimumWalkInReserve = totalSlots > 0 ? Math.ceil(totalSlots * 0.15) : 0;
  const maximumAdvanceTokens = Math.max(totalSlots - minimumWalkInReserve, 0);

  for (let attempt = 0; attempt < MAX_RESERVATION_ATTEMPTS; attempt += 1) {
    const appointments = await fetchDayAppointments(clinicId, doctorName, date);
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

    const occupiedSlots = buildOccupiedSlotSet(appointments);
    const candidates = buildCandidateSlots(type, slots, now, occupiedSlots, appointmentData.slotIndex, {
      appointments: effectiveAppointments,
      walkInSpacing,
    });

    if (candidates.length === 0) {
      throw new Error('No available slots match the booking rules.');
    }

    try {
      const result = await runTransaction(db, async transaction => {
        let counterState: TokenCounterState | null = null;
        if (type === 'W') {
          counterState = await prepareNextTokenNumber(transaction, counterRef);
        }

        let chosenSlotIndex = -1;
        let reservationRef: DocumentReference | null = null;

        for (const slotIndex of candidates) {
          if (occupiedSlots.has(slotIndex)) {
            continue;
          }

          const reservationId = buildReservationDocId(clinicId, doctorName, dateStr, slotIndex);
          const reservationDocRef = doc(db, 'slot-reservations', reservationId);
          const reservationSnapshot = await transaction.get(reservationDocRef);

          if (reservationSnapshot.exists()) {
            continue;
          }

          chosenSlotIndex = slotIndex;
          reservationRef = reservationDocRef;
          break;
        }

        if (chosenSlotIndex < 0 || !reservationRef) {
          const conflictError = new Error(RESERVATION_CONFLICT_CODE);
          (conflictError as { code?: string }).code = RESERVATION_CONFLICT_CODE;
          throw conflictError;
        }

        const reservedSlot = slots[chosenSlotIndex];
        const resolvedTimeString = format(reservedSlot.time, 'hh:mm a');
        let numericToken: number;
        if (type === 'A') {
          numericToken = chosenSlotIndex + 1;
        } else {
          if (!counterState) {
            throw new Error('Unable to allocate walk-in token number.');
          }
          numericToken = totalSlots + counterState.nextNumber;
        }
        const tokenNumber =
          type === 'A'
            ? `A${String(numericToken).padStart(3, '0')}`
            : `${numericToken}W`;

        transaction.set(reservationRef, {
          clinicId,
          doctorName,
          date: dateStr,
          slotIndex: chosenSlotIndex,
          reservedAt: serverTimestamp(),
          reservedBy: type === 'W' ? 'walk-in-booking' : 'appointment-booking',
        });
        if (type === 'W' && counterState) {
          commitNextTokenNumber(transaction, counterRef, counterState);
        }

        return {
          tokenNumber,
          numericToken,
          slotIndex: chosenSlotIndex,
          time: resolvedTimeString,
          reservationId: reservationRef.id,
        };
      });

      return result;
    } catch (error) {
      if (isReservationConflict(error) && attempt < MAX_RESERVATION_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('No available slots match the booking rules.');
}

export async function calculateWalkInDetails(
  clinicId: string,
  doctorName: string,
  doctor: Doctor,
  walkInTokenAllotment: number = 0,
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

  const { slots } = await loadDoctorAndSlots(
    clinicId,
    doctorName,
    date,
    doctor.id
  );
  const appointments = await fetchDayAppointments(clinicId, doctorName, date);
  const occupiedSlots = buildOccupiedSlotSet(appointments);
  const candidates = buildCandidateSlots('W', slots, now, occupiedSlots, undefined, {
    appointments,
    walkInSpacing: walkInTokenAllotment > 0 ? walkInTokenAllotment : undefined,
  });

  if (candidates.length === 0) {
    throw new Error('No walk-in slots are available at this time.');
  }

  const chosenSlotIndex = candidates[0];
  const chosenSlot = slots[chosenSlotIndex];
  const patientsAhead = appointments.filter(appointment => {
    return (
      typeof appointment.slotIndex === 'number' &&
      ACTIVE_STATUSES.has(appointment.status) &&
      appointment.slotIndex < chosenSlotIndex
    );
  }).length;

  const existingWalkIns = appointments.filter(appointment => appointment.bookedVia === 'Walk-in');
  const numericToken = slots.length + existingWalkIns.length + 1;

  return {
    estimatedTime: chosenSlot.time,
    patientsAhead,
    numericToken,
    slotIndex: chosenSlotIndex,
    sessionIndex: chosenSlot.sessionIndex,
    actualSlotTime: chosenSlot.time,
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