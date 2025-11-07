import { collection, query, where, getDocs, writeBatch, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parse, addMinutes, differenceInMinutes, isAfter, format } from 'date-fns';
import type { Appointment } from '@/lib/types';

/**
 * Parse time string to Date object
 */
function parseTime(timeStr: string, referenceDate: Date): Date {
  try {
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      return parse(timeStr, 'hh:mm a', referenceDate);
    }
    const parsed = parse(timeStr, 'HH:mm', referenceDate);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    return parse(timeStr, 'h:mm a', referenceDate);
  } catch (error) {
    console.error('Error parsing time:', timeStr, error);
    return referenceDate;
  }
}

/**
 * Propagate delay to all subsequent appointments
 * When a consultation takes longer than average time, add delay to subsequent appointments
 */
export async function propagateDelay(
  clinicId: string,
  doctorName: string,
  date: string,
  currentAppointmentId: string,
  delayMinutes: number
): Promise<void> {
  if (delayMinutes <= 0) return;

  try {
    // Get all appointments for this doctor and date, sorted by slotIndex
    const appointmentsRef = collection(db, 'appointments');
    const appointmentsQuery = query(
      appointmentsRef,
      where('clinicId', '==', clinicId),
      where('doctor', '==', doctorName),
      where('date', '==', date),
      where('status', 'in', ['Pending', 'Confirmed'])
    );

    const snapshot = await getDocs(appointmentsQuery);
    const appointments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Appointment));

    // Parse appointment times and find current appointment
    const parseAppointmentTime = (apt: Appointment): Date => {
      try {
        const appointmentDate = parse(apt.date, 'd MMMM yyyy', new Date());
        return parseTime(apt.time, appointmentDate);
      } catch {
        return new Date(0);
      }
    };

    // Find current appointment index
    const currentIndex = appointments.findIndex(apt => apt.id === currentAppointmentId);
    if (currentIndex === -1) return;

    // Get all subsequent appointments
    const subsequentAppointments = appointments.slice(currentIndex + 1);

    if (subsequentAppointments.length === 0) return;

    // Update subsequent appointments with delay
    const batch = writeBatch(db);

    for (const apt of subsequentAppointments) {
      try {
        const originalTime = parseAppointmentTime(apt);
        const newTime = addMinutes(originalTime, delayMinutes);
        const newTimeStr = format(newTime, 'hh:mm a');

        const aptRef = doc(db, 'appointments', apt.id);
        batch.update(aptRef, {
          time: newTimeStr,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error(`Error updating appointment ${apt.id}:`, error);
        continue;
      }
    }

    await batch.commit();
  } catch (error) {
    console.error('Error propagating delay:', error);
    throw error;
  }
}

/**
 * Calculate delay when doctor is late
 * Checks current time vs first appointment time and propagates delay
 */
export async function propagateDoctorLateDelay(
  clinicId: string,
  doctorName: string,
  date: string,
  currentTime: Date
): Promise<number> {
  try {
    // Get all confirmed appointments for this doctor and date
    const appointmentsRef = collection(db, 'appointments');
    const appointmentsQuery = query(
      appointmentsRef,
      where('clinicId', '==', clinicId),
      where('doctor', '==', doctorName),
      where('date', '==', date),
      where('status', '==', 'Confirmed')
    );

    const snapshot = await getDocs(appointmentsQuery);
    if (snapshot.empty) return 0;

    const appointments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Appointment));

    // Sort by time
    appointments.sort((a, b) => {
      try {
        const timeA = parseTime(a.time, parse(a.date, 'd MMMM yyyy', new Date()));
        const timeB = parseTime(b.time, parse(b.date, 'd MMMM yyyy', new Date()));
        return timeA.getTime() - timeB.getTime();
      } catch {
        return 0;
      }
    });

    if (appointments.length === 0) return 0;

    // Get first appointment time
    const firstAppointment = appointments[0];
    const firstAppointmentTime = parseTime(
      firstAppointment.time,
      parse(firstAppointment.date, 'd MMMM yyyy', new Date())
    );

    // Calculate delay if doctor is late
    if (isAfter(currentTime, firstAppointmentTime)) {
      const delayMinutes = differenceInMinutes(currentTime, firstAppointmentTime);
      if (delayMinutes > 0) {
        // Propagate delay to all appointments
        await propagateDelay(clinicId, doctorName, date, firstAppointment.id, delayMinutes);
        return delayMinutes;
      }
    }

    return 0;
  } catch (error) {
    console.error('Error propagating doctor late delay:', error);
    return 0;
  }
}

/**
 * Reduce delay for subsequent appointments when a slot is cancelled or no-show
 * When a slot becomes vacant (cancelled/no-show), reduce delays for subsequent appointments
 * This helps recover time when appointments don't happen
 */
export async function reduceDelayOnSlotVacancy(
  clinicId: string,
  doctorName: string,
  date: string,
  cancelledOrNoShowAppointmentId: string,
  slotDuration: number
): Promise<void> {
  try {
    // Get all appointments for this doctor and date, sorted by slotIndex
    const appointmentsRef = collection(db, 'appointments');
    const appointmentsQuery = query(
      appointmentsRef,
      where('clinicId', '==', clinicId),
      where('doctor', '==', doctorName),
      where('date', '==', date),
      where('status', 'in', ['Pending', 'Confirmed'])
    );

    const snapshot = await getDocs(appointmentsQuery);
    const appointments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Appointment));

    // Sort by slotIndex
    appointments.sort((a, b) => (a.slotIndex ?? Infinity) - (b.slotIndex ?? Infinity));

    // Find the cancelled/no-show appointment index
    const cancelledIndex = appointments.findIndex(apt => apt.id === cancelledOrNoShowAppointmentId);
    if (cancelledIndex === -1) return;

    // Get all subsequent appointments
    const subsequentAppointments = appointments.slice(cancelledIndex + 1);
    if (subsequentAppointments.length === 0) return;

    // Update subsequent appointments: reduce delay by slotDuration
    const batch = writeBatch(db);

    for (const apt of subsequentAppointments) {
      try {
        const currentDelay = apt.delay || 0;
        const newDelay = Math.max(0, currentDelay - slotDuration); // Don't go below 0

        // Recalculate noShowTime with reduced delay
        // noShowTime = appointment time + 15 minutes + delay
        const appointmentDate = parse(apt.date, 'd MMMM yyyy', new Date());
        const appointmentTime = parseTime(apt.time, appointmentDate);
        const baseNoShowTime = addMinutes(appointmentTime, 15); // appointment time + 15 minutes
        const newNoShowTime = addMinutes(baseNoShowTime, newDelay); // add remaining delay

        const aptRef = doc(db, 'appointments', apt.id);
        batch.update(aptRef, {
          delay: newDelay,
          noShowTime: newNoShowTime,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error(`Error reducing delay for appointment ${apt.id}:`, error);
        continue;
      }
    }

    await batch.commit();
    console.log(`Reduced delay for ${subsequentAppointments.length} subsequent appointments after cancellation/no-show`);
  } catch (error) {
    console.error('Error reducing delay on slot vacancy:', error);
    throw error;
  }
}


