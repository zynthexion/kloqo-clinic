import { addMinutes, isAfter, isBefore } from "date-fns";

export type SchedulerSlot = {
  index: number;
  time: Date;
  sessionIndex: number;
};

export type SchedulerAdvance = {
  id: string;
  slotIndex: number;
};

export type SchedulerWalkInCandidate = {
  id: string;
  numericToken: number;
  createdAt?: Date | null;
  currentSlotIndex?: number;
};

export type SchedulerAssignment = {
  id: string;
  slotIndex: number;
  sessionIndex: number;
  slotTime: Date;
};

type SchedulerInput = {
  slots: SchedulerSlot[];
  now: Date;
  walkInTokenAllotment: number;
  advanceAppointments: SchedulerAdvance[];
  walkInCandidates: SchedulerWalkInCandidate[];
};

type SchedulerOutput = {
  assignments: SchedulerAssignment[];
};

type Occupant = {
  type: 'A' | 'W';
  id: string;
};

type AdvanceShift = {
  id: string;
  position: number;
};

export function computeWalkInSchedule({
  slots,
  now,
  walkInTokenAllotment,
  advanceAppointments,
  walkInCandidates,
}: SchedulerInput): SchedulerOutput {
  const DEBUG = process.env.NEXT_PUBLIC_DEBUG_WALK_IN === 'true';
  if (DEBUG) {
    console.info('[walk-in scheduler] start', {
      slots: slots.length,
      walkInTokenAllotment,
      now,
      advanceAppointments,
      walkInCandidates,
    });
  }
  const orderedSlots = [...slots].sort((a, b) => a.index - b.index);
  const positionCount = orderedSlots.length;
  if (positionCount === 0 || walkInCandidates.length === 0) {
    return { assignments: [] };
  }

  const indexToPosition = new Map<number, number>();
  orderedSlots.forEach((slot, position) => {
    indexToPosition.set(slot.index, position);
  });

  const spacing =
    Number.isFinite(walkInTokenAllotment) && walkInTokenAllotment > 0
      ? Math.floor(walkInTokenAllotment)
      : 0;

  const occupancy: (Occupant | null)[] = new Array(positionCount).fill(null);
  advanceAppointments.forEach(entry => {
    const position = indexToPosition.get(entry.slotIndex);
    if (typeof position === "number") {
      occupancy[position] = { type: 'A', id: entry.id };
    }
  });

  const sortedWalkIns = [...walkInCandidates].sort((a, b) => {
    if (a.numericToken !== b.numericToken) {
      return a.numericToken - b.numericToken;
    }
    const timeA = a.createdAt ? a.createdAt.valueOf() : 0;
    const timeB = b.createdAt ? b.createdAt.valueOf() : 0;
    return timeA - timeB;
  });

  const oneHourFromNow = addMinutes(now, 60);
  const firstFuturePosition = orderedSlots.findIndex(slot => !isBefore(slot.time, now));
  const effectiveFirstFuturePosition = firstFuturePosition === -1 ? positionCount : firstFuturePosition;

  const assignments = new Map<string, SchedulerAssignment>();
  const preferredPositions = new Map<string, number>();

  walkInCandidates.forEach(candidate => {
    if (typeof candidate.currentSlotIndex === 'number') {
      const position = indexToPosition.get(candidate.currentSlotIndex);
      if (typeof position === 'number') {
        preferredPositions.set(candidate.id, position);
      }
    }
  });

  const applyAssignment = (id: string, position: number) => {
    const slotMeta = orderedSlots[position];
    assignments.set(id, {
      id,
      slotIndex: slotMeta.index,
      sessionIndex: slotMeta.sessionIndex,
      slotTime: slotMeta.time,
    });
  };

  const getLastWalkInPosition = (): number => {
    for (let pos = positionCount - 1; pos >= 0; pos -= 1) {
      if (occupancy[pos]?.type === 'W') {
        return pos;
      }
    }
    return -1;
  };

  const countAdvanceAfter = (anchorPosition: number): number => {
    let count = 0;
    for (
      let pos = Math.max(anchorPosition + 1, effectiveFirstFuturePosition);
      pos < positionCount;
      pos += 1
    ) {
      if (occupancy[pos]?.type === 'A') {
        count += 1;
      }
    }
    return count;
  };

  const findNthAdvanceAfter = (anchorPosition: number, nth: number): number => {
    if (nth <= 0) {
      return -1;
    }
    let count = 0;
    for (
      let pos = Math.max(anchorPosition + 1, effectiveFirstFuturePosition);
      pos < positionCount;
      pos += 1
    ) {
      if (occupancy[pos]?.type === 'A') {
        count += 1;
        if (count === nth) {
          return pos;
        }
      }
    }
    return -1;
  };

  const findLastAdvanceAfter = (anchorPosition: number): number => {
    for (let pos = positionCount - 1; pos > anchorPosition; pos -= 1) {
      if (occupancy[pos]?.type === 'A' && !isBefore(orderedSlots[pos].time, now)) {
        return pos;
      }
    }
    return -1;
  };

  const findFirstEmptyPosition = (startPosition: number): number => {
    for (
      let pos = Math.max(startPosition, effectiveFirstFuturePosition);
      pos < positionCount;
      pos += 1
    ) {
      if (occupancy[pos] !== null) {
        continue;
      }
      if (isBefore(orderedSlots[pos].time, now)) {
        continue;
      }
      return pos;
    }
    return -1;
  };

  const makeSpaceForWalkIn = (
    targetPosition: number,
    isExistingWalkIn: boolean
  ): { position: number; shifts: AdvanceShift[] } => {
    let candidatePosition = targetPosition;
    if (candidatePosition < effectiveFirstFuturePosition) {
      candidatePosition = effectiveFirstFuturePosition;
    }
    while (
      candidatePosition < positionCount &&
      occupancy[candidatePosition]?.type === 'W' &&
      !isExistingWalkIn
    ) {
      candidatePosition += 1;
    }
    if (candidatePosition >= positionCount) {
      return { position: -1, shifts: [] };
    }

    const occupantAtCandidate = occupancy[candidatePosition];
    if (occupantAtCandidate === null) {
      return { position: candidatePosition, shifts: [] };
    }

    const shifts: AdvanceShift[] = [];
    let destination = candidatePosition + 1;

    const moveToNextDestination = (sourcePosition: number, id: string): boolean => {
      let newDestination = destination;
      while (
        newDestination < positionCount &&
        (occupancy[newDestination] !== null || isBefore(orderedSlots[newDestination].time, now))
      ) {
        if (occupancy[newDestination]?.type === 'W') {
          return false;
        }
        newDestination += 1;
      }

      if (newDestination >= positionCount) {
        return false;
      }

      occupancy[sourcePosition] = null;
      occupancy[newDestination] = { type: 'A', id };
      shifts.push({ id, position: newDestination });
      destination = newDestination + 1;
      return true;
    };

    if (occupantAtCandidate?.type === 'A') {
      if (!moveToNextDestination(candidatePosition, occupantAtCandidate.id)) {
        return { position: -1, shifts: [] };
      }
    }

    for (let pos = candidatePosition + 1; pos < positionCount; pos += 1) {
      const occupant = occupancy[pos];

      if (occupant?.type === 'W') {
        break;
      }

      if (occupant?.type !== 'A') {
        continue;
      }

      if (!moveToNextDestination(pos, occupant.id)) {
        break;
      }
    }

    return { position: candidatePosition, shifts };
  };

  for (const candidate of sortedWalkIns) {
    let assignedPosition: number | null = null;

    const preferredPosition = preferredPositions.get(candidate.id);

    if (DEBUG) {
      console.info('[walk-in scheduler] processing walk-in', {
        candidate,
        preferredPosition,
      });
    }
    if (typeof preferredPosition === 'number') {
      const prepared = makeSpaceForWalkIn(preferredPosition, true);
      if (prepared.position !== -1) {
        prepared.shifts.forEach(shift => {
          applyAssignment(shift.id, shift.position);
        });
        occupancy[prepared.position] = { type: 'W', id: candidate.id };
        applyAssignment(candidate.id, prepared.position);
        if (DEBUG) {
          console.info('[walk-in scheduler] placed existing walk-in', {
            candidateId: candidate.id,
            position: prepared.position,
          });
        }
        continue;
      }
    }

    for (let pos = effectiveFirstFuturePosition; pos < positionCount; pos += 1) {
      const slotMeta = orderedSlots[pos];
      if (isAfter(slotMeta.time, oneHourFromNow)) {
        break;
      }
      if (isBefore(slotMeta.time, now)) {
        continue;
      }
      if (occupancy[pos] === null) {
        assignedPosition = pos;
        break;
      }
    }

    if (assignedPosition === null) {
      const anchorPosition = getLastWalkInPosition();
      let targetPosition = -1;

      const advanceAfterAnchor = countAdvanceAfter(anchorPosition);
      if (spacing > 0 && advanceAfterAnchor > spacing) {
        const nthAdvancePosition = findNthAdvanceAfter(anchorPosition, spacing);
        if (nthAdvancePosition !== -1) {
          targetPosition = nthAdvancePosition + 1;
        }
      }

      if (targetPosition === -1) {
        const lastAdvancePosition = findLastAdvanceAfter(anchorPosition);
        if (lastAdvancePosition !== -1) {
          targetPosition = lastAdvancePosition + 1;
        }
      }

      if (targetPosition === -1) {
        targetPosition = findFirstEmptyPosition(effectiveFirstFuturePosition);
      }

      if (targetPosition === -1) {
        targetPosition = findFirstEmptyPosition(0);
      }

      const prepared = makeSpaceForWalkIn(
        targetPosition === -1 ? effectiveFirstFuturePosition : targetPosition,
        false
      );
      if (prepared.position === -1) {
        throw new Error('Unable to allocate walk-in slot.');
      }

      prepared.shifts.forEach(shift => {
        applyAssignment(shift.id, shift.position);
        if (DEBUG) {
          console.info('[walk-in scheduler] shifted advance appointment', shift);
        }
      });
      assignedPosition = prepared.position;
    }

    if (assignedPosition === null) {
      throw new Error('Unable to allocate walk-in slot.');
    }

    occupancy[assignedPosition] = { type: 'W', id: candidate.id };
    applyAssignment(candidate.id, assignedPosition);
    if (DEBUG) {
      console.info('[walk-in scheduler] placed walk-in', {
        candidateId: candidate.id,
        assignedPosition,
      });
    }
  }

  if (DEBUG) {
    console.info('[walk-in scheduler] assignments complete', {
      assignments: Array.from(assignments.values()),
    });
  }
  return { assignments: Array.from(assignments.values()) };
}

