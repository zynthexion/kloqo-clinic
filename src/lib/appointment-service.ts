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
import { format, addMinutes, isAfter, isBefore } from 'date-fns';
import type { Doctor, Appointment } from '@/lib/types';
import { computeWalkInSchedule, type SchedulerAssignment } from '@/lib/walk-in-scheduler';
import { parseTime as parseTimeString } from '@/lib/utils';

const ACTIVE_STATUSES = new Set(['Pending', 'Confirmed']);
const MAX_TRANSACTION_ATTEMPTS = 5;
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

  const { slots } = await loadDoctorAndSlots(
        clinicId,
        doctorName,
    date,
    typeof appointmentData.doctorId === 'string' ? appointmentData.doctorId : undefined
  );
  const totalSlots = slots.length;
  const minimumWalkInReserve = totalSlots > 0 ? Math.ceil(totalSlots * 0.15) : 0;
  const maximumAdvanceTokens = Math.max(totalSlots - minimumWalkInReserve, 0);

  const appointmentsRef = collection(db, 'appointments');
  const appointmentsQuery = query(
    appointmentsRef,
    where('clinicId', '==', clinicId),
    where('doctor', '==', doctorName),
    where('date', '==', dateStr),
    orderBy('slotIndex', 'asc')
  );

  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const appointmentsSnapshot = await getDocs(appointmentsQuery);
    const appointmentDocRefs = appointmentsSnapshot.docs.map(docSnap => doc(db, 'appointments', docSnap.id));

    try {
      return await runTransaction(db, async transaction => {
        const counterState = await prepareNextTokenNumber(transaction, counterRef);

        const appointmentSnapshots = await Promise.all(
          appointmentDocRefs.map(ref => transaction.get(ref))
        );
        const appointments = appointmentSnapshots
          .filter(snapshot => snapshot.exists())
          .map(snapshot => ({
            id: snapshot.id,
            ...(snapshot.data() as Appointment),
          }));

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

        let numericToken: number;
        let tokenNumber: string;
        let chosenSlotIndex = -1;
        let sessionIndexForNew = 0;
        let resolvedTimeString = '';
        let reservationRef: DocumentReference | null = null;

        if (type === 'W') {
          numericToken = totalSlots + counterState.nextNumber;
          tokenNumber = `W${String(numericToken).padStart(3, '0')}`;

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

          const walkInCandidates = [
            ...activeWalkIns.map(appointment => ({
              id: appointment.id,
              numericToken: typeof appointment.numericToken === 'number' ? appointment.numericToken : 0,
              createdAt: toDate(appointment.createdAt),
              currentSlotIndex: typeof appointment.slotIndex === 'number' ? appointment.slotIndex : undefined,
            })),
            {
              id: '__new_walk_in__',
              numericToken,
              createdAt: now,
            },
          ];

          const prepareAdvanceShift = async (
            targetSlotIndex: number,
            blockedSlots: Set<number>
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
            const targetReservationSnapshot = await transaction.get(targetReservationRef);
            if (targetReservationSnapshot.exists()) {
              reservationDeletes.push(targetReservationRef);
            }

            const targetAppointment = advanceOccupancy[targetSlotIndex];
            if (!targetAppointment) {
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

            const blockedIndices = new Set<number>(blockedSlots);
            blockedIndices.add(targetSlotIndex);

            const availableSlots: Array<{
              index: number;
              sessionIndex: number;
              time: Date;
            }> = [];

            for (let idx = targetSlotIndex; idx < totalSlots; idx += 1) {
              if (blockedIndices.has(idx) || idx === targetSlotIndex) {
                continue;
              }
              if (advanceOccupancy[idx] !== null) {
                continue;
              }
              const slotMeta = slots[idx];
              if (!slotMeta) {
                continue;
              }
              if (isBefore(slotMeta.time, now)) {
                continue;
              }
              const reservationRefForSlot = doc(
                db,
                'slot-reservations',
                buildReservationDocId(clinicId, doctorName, dateStr, idx)
              );
              const reservationSnapshotForSlot = await transaction.get(reservationRefForSlot);
              if (reservationSnapshotForSlot.exists()) {
                reservationDeletes.push(reservationRefForSlot);
              }
              availableSlots.push({
                index: idx,
                sessionIndex: slotMeta.sessionIndex,
                time: slotMeta.time,
              });
            }

            if (availableSlots.length < appointmentsToReassign.length) {
              throw new Error('No available slots match the booking rules.');
            }

            let availableIndex = 0;
            for (const appointmentToMove of appointmentsToReassign) {
              const destination = availableSlots[availableIndex];
              availableIndex += 1;
              if (!destination) {
                throw new Error('No available slots match the booking rules.');
              }

              const timeString = format(destination.time, 'hh:mm a');
              const noShowTime = addMinutes(destination.time, 15);

              const appointmentRef = doc(db, 'appointments', appointmentToMove.id);
              appointmentUpdates.push({
                appointmentId: appointmentToMove.id,
                docRef: appointmentRef,
                slotIndex: destination.index,
                sessionIndex: destination.sessionIndex,
                timeString,
                noShowTime,
              });

              const cloned = updatedAdvanceMap.get(appointmentToMove.id);
              if (cloned) {
                cloned.slotIndex = destination.index;
                cloned.sessionIndex = destination.sessionIndex;
                cloned.time = timeString;
                cloned.noShowTime = noShowTime;
              }

              advanceOccupancy[destination.index] = appointmentToMove;
            }

            return {
              reservationDeletes,
              appointmentUpdates,
              updatedAdvanceAppointments: activeAdvanceAppointments.map(appointment => {
                return updatedAdvanceMap.get(appointment.id) ?? appointment;
              }),
            };
          };

          const schedule = computeWalkInSchedule({
            slots,
            now,
            walkInTokenAllotment: walkInSpacingValue,
            advanceAppointments: activeAdvanceAppointments.map(entry => ({
              id: entry.id,
              slotIndex: typeof entry.slotIndex === 'number' ? entry.slotIndex : -1,
            })),
            walkInCandidates,
          });

          const newAssignment = schedule.assignments.find(assignment => assignment.id === '__new_walk_in__');
          if (!newAssignment) {
            throw new Error('Unable to schedule walk-in token.');
          }

          const plannedWalkInSlots = new Set<number>(
            schedule.assignments
              .map(assignment => assignment.slotIndex)
              .filter(slotIndex => typeof slotIndex === 'number' && slotIndex >= 0)
          );

          const shiftPlan = await prepareAdvanceShift(
            newAssignment.slotIndex,
            new Set<number>(plannedWalkInSlots)
          );

          activeAdvanceAppointments = shiftPlan.updatedAdvanceAppointments;

          const assignmentById = new Map(schedule.assignments.map(assignment => [assignment.id, assignment]));

          const reservationId = buildReservationDocId(clinicId, doctorName, dateStr, newAssignment.slotIndex);
          const reservationDocRef = doc(db, 'slot-reservations', reservationId);

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
            });

            const advanceRecord = activeAdvanceAppointments.find(item => item.id === updateOp.appointmentId);
            if (advanceRecord) {
              advanceRecord.slotIndex = updateOp.slotIndex;
              advanceRecord.sessionIndex = updateOp.sessionIndex;
              advanceRecord.time = updateOp.timeString;
              advanceRecord.noShowTime = updateOp.noShowTime;
            }
          }

          for (const appointment of activeWalkIns) {
            const assignment = assignmentById.get(appointment.id);
            if (!assignment) continue;

            const currentSlotIndex = typeof appointment.slotIndex === 'number' ? appointment.slotIndex : -1;
            const newSlotIndex = assignment.slotIndex;
            const newTimeString = format(assignment.slotTime, 'hh:mm a');
            const noShowTime = addMinutes(assignment.slotTime, 15);

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

          reservationRef = reservationDocRef;
          chosenSlotIndex = newAssignment.slotIndex;
          sessionIndexForNew = newAssignment.sessionIndex;
          resolvedTimeString = format(newAssignment.slotTime, 'hh:mm a');
        } else {
          numericToken = counterState.nextNumber;
          tokenNumber = `A${String(numericToken).padStart(3, '0')}`;

          const occupiedSlots = buildOccupiedSlotSet(effectiveAppointments);
          const candidates = buildCandidateSlots(type, slots, now, occupiedSlots, appointmentData.slotIndex, {
            appointments: effectiveAppointments,
          });

          if (candidates.length === 0) {
            throw new Error('No available slots match the booking rules.');
          }

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

            reservationRef = reservationDocRef;
            chosenSlotIndex = slotIndex;
            const reservedSlot = slots[chosenSlotIndex];
            sessionIndexForNew = reservedSlot?.sessionIndex ?? 0;
            resolvedTimeString = format(reservedSlot?.time ?? now, 'hh:mm a');
            break;
          }

          if (chosenSlotIndex < 0 || !reservationRef) {
            throw new Error('No available slots match the booking rules.');
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
        commitNextTokenNumber(transaction, counterRef, counterState);
    
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
      if (isReservationConflict(error) && attempt < MAX_TRANSACTION_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('No available slots match the booking rules.');
}

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

  const { slots } = await loadDoctorAndSlots(clinicId, doctorName, date, doctorId);
  const appointments = await fetchDayAppointments(clinicId, doctorName, date);

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
    const walkInRefs = activeWalkIns.map(appointment => doc(db, 'appointments', appointment.id));
    const walkInSnapshots = await Promise.all(walkInRefs.map(ref => transaction.get(ref)));

    const freshWalkIns = walkInSnapshots
      .filter(snapshot => snapshot.exists())
      .map(snapshot => ({ id: snapshot.id, ...(snapshot.data() as Appointment) }))
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
      advanceAppointments: activeAdvanceAppointments.map(entry => ({
        id: entry.id,
        slotIndex: typeof entry.slotIndex === 'number' ? entry.slotIndex : -1,
      })),
      walkInCandidates,
    });

    const assignmentById = new Map(schedule.assignments.map(assignment => [assignment.id, assignment]));

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
        noShowTime: addMinutes(assignment.slotTime, 15),
      });
    }
  });
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

  const { slots } = await loadDoctorAndSlots(clinicId, doctorName, date, doctor.id);
  const appointments = await fetchDayAppointments(clinicId, doctorName, date);

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

  const schedule = computeWalkInSchedule({
    slots,
    now,
    walkInTokenAllotment,
    advanceAppointments: activeAdvanceAppointments.map(entry => ({
      id: entry.id,
      slotIndex: typeof entry.slotIndex === 'number' ? entry.slotIndex : -1,
    })),
    walkInCandidates,
  });

  const assignment = schedule.assignments.find(entry => entry.id === placeholderId);

  if (!assignment) {
    throw new Error('No walk-in slots are available at this time.');
  }

  const patientsAhead = activeWalkIns.length;
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
  const { slots } = await loadDoctorAndSlots(clinicId, doctorName, date, doctorId);
  const appointments = await fetchDayAppointments(clinicId, doctorName, date);

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

  const schedule = computeWalkInSchedule({
    slots,
    now: new Date(),
    walkInTokenAllotment,
    advanceAppointments: activeAdvanceAppointments.map(entry => ({
      id: entry.id,
      slotIndex: typeof entry.slotIndex === 'number' ? entry.slotIndex : -1,
    })),
    walkInCandidates,
  });

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