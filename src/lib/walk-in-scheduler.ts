import { addMinutes, isAfter, isBefore } from "date-fns";

export type SchedulerSlot = {
  index: number;
  time: Date;
  sessionIndex: number;
};

export type SchedulerAdvance = {
  id: string;
  slotIndex: number;
  status?: 'Confirmed' | 'Pending';
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
      advanceAppointmentsCount: advanceAppointments.length,
      advanceAppointments: advanceAppointments.map(a => ({ id: a.id, slotIndex: a.slotIndex })),
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
  const advanceStatusMap = new Map<string, 'Confirmed' | 'Pending'>();
  const overflowAdvance: { id: string; sourcePosition: number; status?: 'Confirmed' | 'Pending' }[] = [];
  advanceAppointments.forEach(entry => {
    if (entry.status) {
      advanceStatusMap.set(entry.id, entry.status);
    }
    const position = indexToPosition.get(entry.slotIndex);
    if (typeof position === "number") {
      if (occupancy[position] === null) {
        occupancy[position] = { type: 'A', id: entry.id };
        if (DEBUG && entry.id.startsWith('__blocked_cancelled_')) {
          console.info('[walk-in scheduler] Blocked cancelled slot at position', position, 'slotIndex', entry.slotIndex);
        }
      } else {
        overflowAdvance.push({ id: entry.id, sourcePosition: position, status: entry.status });
      }
    } else {
      overflowAdvance.push({ id: entry.id, sourcePosition: -1, status: entry.status });
      if (DEBUG && entry.id.startsWith('__blocked_cancelled_')) {
        console.warn('[walk-in scheduler] Blocked cancelled slot not found in slots:', entry.slotIndex);
      }
    }
  });
  
  if (DEBUG) {
    const blockedSlots = advanceAppointments.filter(a => a.id.startsWith('__blocked_cancelled_'));
    if (blockedSlots.length > 0) {
      console.info('[walk-in scheduler] Blocked cancelled slots:', blockedSlots.map(a => a.slotIndex));
      console.info('[walk-in scheduler] Occupancy after blocking:', occupancy.map((occ, idx) => ({ position: idx, occupant: occ })));
    }
  }

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

  const findEarliestWindowEmptyPosition = (): number => {
    for (
      let pos = Math.max(effectiveFirstFuturePosition, 0);
      pos < positionCount;
      pos += 1
    ) {
      const slotMeta = orderedSlots[pos];
      if (isBefore(slotMeta.time, now)) {
        continue;
      }
      if (isAfter(slotMeta.time, oneHourFromNow)) {
        break;
      }
      if (occupancy[pos] === null) {
        return pos;
      }
    }
    return -1;
  };

  if (overflowAdvance.length > 0) {
    const sortedOverflow = [...overflowAdvance].sort(
      (a, b) => a.sourcePosition - b.sourcePosition
    );
    for (const entry of sortedOverflow) {
      const startPosition =
        entry.sourcePosition >= 0
          ? Math.max(entry.sourcePosition + 1, effectiveFirstFuturePosition)
          : effectiveFirstFuturePosition;
      let emptyPosition = findFirstEmptyPosition(startPosition);
      if (emptyPosition === -1) {
        emptyPosition = findFirstEmptyPosition(effectiveFirstFuturePosition);
      }
      if (emptyPosition === -1) {
        continue;
      }

      occupancy[emptyPosition] = { type: 'A', id: entry.id };
      applyAssignment(entry.id, emptyPosition);
    }
  }

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

    const blockPositions: number[] = [];
    for (let pos = candidatePosition; pos < positionCount; pos += 1) {
      const occupant = occupancy[pos];
      if (occupant === null) {
        break;
      }
      if (occupant.type === 'W') {
        break;
      }
      if (occupant.type === 'A') {
        blockPositions.push(pos);
      }
    }

    if (blockPositions.length === 0) {
      return { position: candidatePosition, shifts: [] };
    }

    const tailPosition = blockPositions[blockPositions.length - 1];
    let emptyPosition = findFirstEmptyPosition(tailPosition + 1);
    if (emptyPosition === -1) {
      return { position: -1, shifts: [] };
    }

    const shifts: AdvanceShift[] = [];

    for (let index = blockPositions.length - 1; index >= 0; index -= 1) {
      const fromPosition = blockPositions[index];
      const occupant = occupancy[fromPosition];
      if (!occupant || occupant.type !== 'A') {
        continue;
      }

      if (emptyPosition <= fromPosition) {
        emptyPosition = findFirstEmptyPosition(fromPosition + 1);
        if (emptyPosition === -1) {
          return { position: -1, shifts: [] };
        }
      }

      occupancy[fromPosition] = null;
      occupancy[emptyPosition] = { type: 'A', id: occupant.id };
      shifts.push({ id: occupant.id, position: emptyPosition });
      emptyPosition = fromPosition;
    }

    shifts.reverse();

    return { position: candidatePosition, shifts };
  };

  for (const candidate of sortedWalkIns) {
    let assignedPosition: number | null = null;

    const preferredPosition = preferredPositions.get(candidate.id);
    const earliestWindowPosition = findEarliestWindowEmptyPosition();
    const preferredThreshold =
      typeof preferredPosition === 'number' ? preferredPosition : Number.POSITIVE_INFINITY;

    if (
      earliestWindowPosition !== -1 &&
      earliestWindowPosition < preferredThreshold
    ) {
      const prepared = makeSpaceForWalkIn(earliestWindowPosition, true);
      if (prepared.position !== -1) {
        prepared.shifts.forEach(shift => {
          applyAssignment(shift.id, shift.position);
        });
        occupancy[prepared.position] = { type: 'W', id: candidate.id };
        applyAssignment(candidate.id, prepared.position);
        if (DEBUG) {
          console.info('[walk-in scheduler] bubbled walk-in into 1-hour window', {
            candidateId: candidate.id,
            position: prepared.position,
          });
        }
        continue;
      }
    }

    if (typeof preferredPosition === 'number') {
      const anchorPosition = getLastWalkInPosition();
      if (anchorPosition !== -1) {
        const sequentialPosition = findFirstEmptyPosition(anchorPosition + 1);
        if (
          sequentialPosition !== -1 &&
          sequentialPosition < preferredPosition
        ) {
          const prepared = makeSpaceForWalkIn(sequentialPosition, true);
          if (prepared.position !== -1) {
            prepared.shifts.forEach(shift => {
              applyAssignment(shift.id, shift.position);
            });
            occupancy[prepared.position] = { type: 'W', id: candidate.id };
            applyAssignment(candidate.id, prepared.position);
            if (DEBUG) {
              console.info('[walk-in scheduler] tightened walk-in sequence', {
                candidateId: candidate.id,
                position: prepared.position,
              });
            }
            continue;
          }
        }
      }
    }

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

  // Propagation: Move Confirmed A tokens forward to fill empty slots, then move W tokens forward
  const findFirstWalkInPosition = (): number => {
    for (let pos = 0; pos < positionCount; pos += 1) {
      if (occupancy[pos]?.type === 'W') {
        return pos;
      }
    }
    return -1;
  };

  let firstWalkInPos = findFirstWalkInPosition();
  if (firstWalkInPos !== -1) {
    let propagationActive = true;
    let maxIterations = 100; // Safety limit
    while (propagationActive && maxIterations > 0) {
      maxIterations -= 1;
      propagationActive = false;

      // Find all empty slots within one-hour window (not just before first W position)
      // This allows proper cascading even when W tokens move forward
      const emptySlots: number[] = [];
      for (let pos = effectiveFirstFuturePosition; pos < positionCount; pos += 1) {
        const slotMeta = orderedSlots[pos];
        if (isBefore(slotMeta.time, now)) {
          continue;
        }
        if (isAfter(slotMeta.time, oneHourFromNow)) {
          break;
        }
        if (occupancy[pos] === null) {
          emptySlots.push(pos);
        }
      }

      if (emptySlots.length === 0) {
        break;
      }

      // Find Confirmed A tokens that are before the first W token
      const confirmedAdvanceBeforeWalkIn: { id: string; position: number }[] = [];
      for (let pos = effectiveFirstFuturePosition; pos < firstWalkInPos && pos < positionCount; pos += 1) {
        const occupant = occupancy[pos];
        if (occupant?.type === 'A') {
          const status = advanceStatusMap.get(occupant.id);
          if (status === 'Confirmed') {
            confirmedAdvanceBeforeWalkIn.push({ id: occupant.id, position: pos });
          }
        }
      }

      // Sort by position (earliest first)
      confirmedAdvanceBeforeWalkIn.sort((a, b) => a.position - b.position);
      emptySlots.sort((a, b) => a.position - b.position);

      // First, try to move Confirmed A tokens to fill empty slots that are before or at first W position
      if (confirmedAdvanceBeforeWalkIn.length > 0) {
        // Filter empty slots to only those before or at first W position (where A tokens can move)
        const emptySlotsForAdvance = emptySlots.filter(slot => slot <= firstWalkInPos);
        
        // Move Confirmed A tokens to fill empty slots (one at a time to allow proper propagation)
        for (const emptySlot of emptySlotsForAdvance) {
          // Find the earliest Confirmed A token that is before this empty slot
          let bestAdvance: { id: string; position: number } | null = null;
          for (const advanceEntry of confirmedAdvanceBeforeWalkIn) {
            const occupant = occupancy[advanceEntry.position];
            if (occupant?.type === 'A' && occupant.id === advanceEntry.id && advanceEntry.position < emptySlot) {
              bestAdvance = advanceEntry;
              break;
            }
          }

          if (!bestAdvance) {
            continue;
          }

          const fromPosition = bestAdvance.position;
          const occupant = occupancy[fromPosition];
          if (occupant?.type === 'A' && occupant.id === bestAdvance.id) {
            // Move A token forward
            occupancy[fromPosition] = null;
            occupancy[emptySlot] = occupant;
            applyAssignment(occupant.id, emptySlot);
            propagationActive = true;

            if (DEBUG) {
              console.info('[walk-in scheduler] propagation: moved Confirmed A token forward', {
                id: occupant.id,
                from: fromPosition,
                to: emptySlot,
              });
            }

            // Cascade W tokens forward to fill gaps left by A tokens
            let currentGap = fromPosition;
            while (true) {
              // Find the earliest W token that comes after the current gap
              let earliestWalkInAfter: { id: string; position: number } | null = null;
              for (let pos = Math.max(currentGap + 1, firstWalkInPos); pos < positionCount; pos += 1) {
                const occupantAtPos = occupancy[pos];
                if (occupantAtPos?.type === 'W') {
                  earliestWalkInAfter = { id: occupantAtPos.id, position: pos };
                  break;
                }
              }

              if (!earliestWalkInAfter) {
                break;
              }

              // Move this W token to fill the gap
              const walkInOccupant = occupancy[earliestWalkInAfter.position];
              if (walkInOccupant?.type === 'W' && walkInOccupant.id === earliestWalkInAfter.id) {
                occupancy[earliestWalkInAfter.position] = null;
                occupancy[currentGap] = walkInOccupant;
                applyAssignment(walkInOccupant.id, currentGap);

                // Update firstWalkInPos if this W token moved earlier
                if (currentGap < firstWalkInPos) {
                  firstWalkInPos = currentGap;
                }

                if (DEBUG) {
                  console.info('[walk-in scheduler] propagation: cascaded W token forward after A move', {
                    id: walkInOccupant.id,
                    from: earliestWalkInAfter.position,
                    to: currentGap,
                  });
                }

                // Update the gap to the position where this W token was
                currentGap = earliestWalkInAfter.position;
              } else {
                break;
              }
            }

            // Break to recalculate empty slots and confirmed advances
            break;
          }
        }
      } else {
        // No Confirmed A tokens to move, so move W tokens forward to fill empty slots
        // Process empty slots one at a time to allow cascading
        for (const emptySlot of emptySlots) {
          // Find the earliest W token that is after this empty slot
          let earliestWalkInAfter: { id: string; position: number } | null = null;
          for (let pos = Math.max(emptySlot + 1, firstWalkInPos); pos < positionCount; pos += 1) {
            const occupant = occupancy[pos];
            if (occupant?.type === 'W') {
              earliestWalkInAfter = { id: occupant.id, position: pos };
              break;
            }
          }

          if (!earliestWalkInAfter) {
            continue;
          }

          const fromPosition = earliestWalkInAfter.position;
          const occupant = occupancy[fromPosition];
          if (occupant?.type === 'W' && occupant.id === earliestWalkInAfter.id) {
            // Move W token forward to fill empty slot
            occupancy[fromPosition] = null;
            occupancy[emptySlot] = occupant;
            applyAssignment(occupant.id, emptySlot);
            propagationActive = true;

            // Update firstWalkInPos if this W token moved earlier
            if (emptySlot < firstWalkInPos) {
              firstWalkInPos = emptySlot;
            }

            if (DEBUG) {
              console.info('[walk-in scheduler] propagation: moved W token forward to fill empty slot', {
                id: occupant.id,
                from: fromPosition,
                to: emptySlot,
              });
            }

            // Now cascade: continue moving W tokens forward to fill gaps
            let currentGap = fromPosition;
            while (true) {
              // Find the next W token after the current gap
              let nextWalkInAfter: { id: string; position: number } | null = null;
              for (let pos = currentGap + 1; pos < positionCount; pos += 1) {
                const occupantAtPos = occupancy[pos];
                if (occupantAtPos?.type === 'W') {
                  nextWalkInAfter = { id: occupantAtPos.id, position: pos };
                  break;
                }
              }

              if (!nextWalkInAfter) {
                break;
              }

              // Move the next W token to fill the gap
              const nextWalkInOccupant = occupancy[nextWalkInAfter.position];
              if (nextWalkInOccupant?.type === 'W' && nextWalkInOccupant.id === nextWalkInAfter.id) {
                occupancy[nextWalkInAfter.position] = null;
                occupancy[currentGap] = nextWalkInOccupant;
                applyAssignment(nextWalkInOccupant.id, currentGap);

                if (DEBUG) {
                  console.info('[walk-in scheduler] propagation: cascaded W token forward', {
                    id: nextWalkInOccupant.id,
                    from: nextWalkInAfter.position,
                    to: currentGap,
                  });
                }

                // Update the gap to the position where this W token was
                currentGap = nextWalkInAfter.position;
              } else {
                break;
              }
            }

            // Break to recalculate empty slots and allow next iteration
            break;
          }
        }
      }
    }
  }

  if (DEBUG) {
    console.info('[walk-in scheduler] assignments complete', {
      assignments: Array.from(assignments.values()),
    });
  }
  return { assignments: Array.from(assignments.values()) };
}

