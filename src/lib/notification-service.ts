/**
 * Notification Service for Nurse App
 * Sends notifications to patients when appointments are created
 */

import { Firestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { parse, format, subMinutes } from 'date-fns';
import { parseTime } from '@/lib/utils';
import type { Appointment } from '@/lib/types';

export async function sendNotificationToPatient(params: {
  firestore: Firestore;
  patientId: string;
  title: string;
  body: string;
  data: any;
}): Promise<boolean> {
  try {
    const { firestore, patientId, title, body, data } = params;

    console.log('🔔 DEBUG: Starting notification process');
    console.log('🔔 DEBUG: Patient ID:', patientId);
    console.log('🔔 DEBUG: Title:', title);
    console.log('🔔 DEBUG: Body:', body);

    // Get patient document to find primaryUserId
    const patientDoc = await getDoc(doc(firestore, 'patients', patientId));
    if (!patientDoc.exists()) {
      console.error('🔔 DEBUG: Patient not found in Firestore');
      return false;
    }

    const patientData = patientDoc.data();
    console.log('🔔 DEBUG: Patient data:', JSON.stringify(patientData));
    const userId = patientData.primaryUserId;
    console.log('🔔 DEBUG: Primary User ID:', userId);

    if (!userId) {
      console.error('🔔 DEBUG: No primary user ID for patient');
      return false;
    }

    // Get user's FCM token
    const userDoc = await getDoc(doc(firestore, 'users', userId));
    if (!userDoc.exists()) {
      console.error('🔔 DEBUG: User not found in Firestore');
      return false;
    }

    const userData = userDoc.data();
    console.log('🔔 DEBUG: User data:', JSON.stringify({
      uid: userData.uid,
      phone: userData.phone,
      notificationsEnabled: userData.notificationsEnabled,
      hasFCMToken: !!userData.fcmToken,
      fcmTokenLength: userData.fcmToken?.length || 0
    }));
    
    if (!userData.notificationsEnabled) {
      console.error('🔔 DEBUG: Notifications disabled for user');
      return false;
    }

    const fcmToken = userData.fcmToken;
    if (!fcmToken) {
      console.error('🔔 DEBUG: No FCM token for user');
      return false;
    }

    console.log('🔔 DEBUG: FCM Token exists:', fcmToken.substring(0, 20) + '...');

    // Build API URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const apiUrl = `${baseUrl}/api/send-notification`;
    console.log('🔔 DEBUG: API URL:', apiUrl);

    // Send notification via API
    console.log('🔔 DEBUG: Sending notification to:', apiUrl);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fcmToken,
        title,
        body,
        data,
      }),
    });

    console.log('🔔 DEBUG: Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔔 DEBUG: Failed to send notification. Status:', response.status);
      console.error('🔔 DEBUG: Error response:', errorText);
      return false;
    }

    const responseData = await response.json();
    console.log('🔔 DEBUG: Notification sent successfully:', responseData);
    return true;
  } catch (error) {
    console.error('🔔 DEBUG: Error sending notification to patient:', error);
    if (error instanceof Error) {
      console.error('🔔 DEBUG: Error message:', error.message);
      console.error('🔔 DEBUG: Error stack:', error.stack);
    }
    return false;
  }
}

/**
 * Send appointment confirmed notification when nurse/clinic books appointment
 */
export async function sendAppointmentBookedByStaffNotification(params: {
  firestore: Firestore;
  patientId: string;
  appointmentId: string;
  doctorName: string;
  clinicName: string;
  date: string;
  time: string;
  tokenNumber: string;
  bookedBy: 'nurse' | 'admin';
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, doctorName, clinicName, date, time, tokenNumber, bookedBy } = params;

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: 'Appointment Booked',
    body: `${params.clinicName} has booked an appointment with Dr. ${doctorName} on ${date} at ${time}. Token: ${tokenNumber}`,
    data: {
      type: 'appointment_confirmed',
      appointmentId,
      doctorName,
      date,
      time,
      tokenNumber,
      bookedBy,
      url: '/appointments', // Click will open appointments page
    },
  });
}

/**
 * Send notification when patient's token is called
 */
export async function sendTokenCalledNotification(params: {
  firestore: Firestore;
  patientId: string;
  appointmentId: string;
  clinicName: string;
  tokenNumber: string;
  doctorName: string;
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, clinicName, tokenNumber, doctorName } = params;

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: 'Your Turn!',
    body: `Token ${tokenNumber} for Dr. ${doctorName} is now being served at ${clinicName}. Please proceed to the clinic.`,
    data: {
      type: 'token_called',
      appointmentId,
      clinicName,
      tokenNumber,
      doctorName,
    },
  });
}

/**
 * Send notification when appointment is cancelled
 */
export async function sendAppointmentCancelledNotification(params: {
  firestore: Firestore;
  patientId: string;
  appointmentId: string;
  doctorName: string;
  clinicName: string;
  date: string;
  time: string;
  cancelledBy: 'patient' | 'clinic';
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, doctorName, clinicName, date, time, cancelledBy } = params;

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: 'Appointment Cancelled',
    body: cancelledBy === 'patient' 
      ? `Your appointment with Dr. ${doctorName} on ${date} at ${time} has been cancelled.`
      : `${clinicName} has cancelled your appointment with Dr. ${doctorName} on ${date} at ${time}.`,
    data: {
      type: 'appointment_cancelled',
      appointmentId,
      doctorName,
      clinicName,
      date,
      time,
      cancelledBy,
    },
  });
}

/**
 * Send notification when doctor is running late
 */
export async function sendDoctorRunningLateNotification(params: {
  firestore: Firestore;
  patientId: string;
  appointmentId: string;
  doctorName: string;
  clinicName: string;
  delayMinutes: number;
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, doctorName, clinicName, delayMinutes } = params;

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: 'Doctor Running Late',
    body: `Dr. ${doctorName} at ${clinicName} is running approximately ${delayMinutes} minutes late.`,
    data: {
      type: 'doctor_late',
      appointmentId,
      doctorName,
      clinicName,
      delayMinutes,
    },
  });
}

/**
 * Send notification when doctor goes on break and appointment time changes
 */
export async function sendBreakUpdateNotification(params: {
  firestore: Firestore;
  patientId: string;
  appointmentId: string;
  doctorName: string;
  clinicName: string;
  oldTime: string;
  newTime: string;
  reason?: string;
  arriveByTime?: string;
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, doctorName, clinicName, oldTime, newTime, reason, arriveByTime } = params;

  // If arriveByTime is provided, calculate new time as arriveByTime - 15 minutes
  // Otherwise, use newTime - 15 minutes
  let displayNewTime = newTime;
  try {
    // Get appointment date from appointmentId if needed
    let appointmentDate: Date = new Date();
    try {
      const appointmentDoc = await getDoc(doc(firestore, 'appointments', appointmentId));
      if (appointmentDoc.exists()) {
        const appointmentData = appointmentDoc.data() as Appointment;
        appointmentDate = parse(appointmentData.date, 'd MMMM yyyy', new Date());
      }
    } catch (e) {
      // Use current date as fallback
      appointmentDate = new Date();
    }

    if (arriveByTime) {
      // Use arriveByTime from database - subtract 15 minutes
      const arriveByDateTime = parseTime(arriveByTime, appointmentDate);
      const calculatedNewTime = subMinutes(arriveByDateTime, 15);
      displayNewTime = format(calculatedNewTime, 'hh:mm a');
    } else {
      // Use newTime - subtract 15 minutes
      const newTimeDateTime = parseTime(newTime, appointmentDate);
      const calculatedNewTime = subMinutes(newTimeDateTime, 15);
      displayNewTime = format(calculatedNewTime, 'hh:mm a');
    }
  } catch (error) {
    console.error('Error calculating new time from arriveByTime:', error);
    // Fallback to provided newTime
  }

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: 'Appointment Time Changed',
    body: `${clinicName} has rescheduled your appointment with Dr. ${doctorName} from ${oldTime} to ${displayNewTime}.${reason ? ` Reason: ${reason}` : ''}`,
    data: {
      type: 'appointment_rescheduled',
      appointmentId,
      doctorName,
      clinicName,
      oldTime,
      newTime: displayNewTime,
      reason,
    },
  });
}

/**
 * Send notification when appointment is marked as Skipped
 */
export async function sendAppointmentSkippedNotification(params: {
  firestore: Firestore;
  patientId: string;
  appointmentId: string;
  doctorName: string;
  clinicName: string;
  date: string;
  time: string;
  tokenNumber: string;
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, doctorName, clinicName, date, time, tokenNumber } = params;

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: 'Appointment Skipped',
    body: `Your appointment with Dr. ${doctorName} on ${date} at ${time} (Token: ${tokenNumber}) has been marked as Skipped because you didn't confirm your arrival 5 minutes before the appointment time.`,
    data: {
      type: 'appointment_skipped',
      appointmentId,
      doctorName,
      clinicName,
      date,
      time,
      tokenNumber,
      url: '/live-token', // Click will open live token page
    },
  });
}

/**
 * Send notification to patients about how many people are ahead of them
 */
export async function sendPeopleAheadNotification(params: {
  firestore: Firestore;
  patientId: string;
  appointmentId: string;
  clinicName: string;
  tokenNumber: string;
  doctorName: string;
  peopleAhead: number;
  appointmentTime: string;
  appointmentDate: string;
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, clinicName, tokenNumber, doctorName, peopleAhead, appointmentTime, appointmentDate } = params;

  // Calculate display time (arriveByTime - 15 minutes)
  let displayTime = appointmentTime;
  try {
    const appointmentDateObj = parse(appointmentDate, 'd MMMM yyyy', new Date());
    const appointmentDateTime = parseTime(appointmentTime, appointmentDateObj);
    const displayDateTime = subMinutes(appointmentDateTime, 15);
    displayTime = format(displayDateTime, 'hh:mm a');
  } catch (error) {
    console.error('Error calculating display time:', error);
  }

  const peopleAheadText = peopleAhead === 1 ? '1 person' : `${peopleAhead} people`;
  const body = peopleAhead === 0
    ? `There is ${peopleAheadText} ahead of you. You will be next to see Dr. ${doctorName} at ${clinicName}. Your appointment time: ${displayTime}. Token: ${tokenNumber}`
    : `There ${peopleAhead === 1 ? 'is' : 'are'} ${peopleAheadText} ahead of you. You will be next to see Dr. ${doctorName} at ${clinicName}. Your appointment time: ${displayTime}. Token: ${tokenNumber}`;

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: peopleAhead === 0 ? 'You are Next!' : `Queue Update: ${peopleAheadText} Ahead`,
    body,
    data: {
      type: 'queue_update',
      appointmentId,
      clinicName,
      tokenNumber,
      doctorName,
      peopleAhead,
      appointmentTime: displayTime,
      appointmentDate,
      url: '/live-token',
    },
  });
}

/**
 * Send notification when doctor starts consultation (status becomes 'In')
 */
export async function sendDoctorConsultationStartedNotification(params: {
  firestore: Firestore;
  patientId: string;
  appointmentId: string;
  clinicName: string;
  tokenNumber: string;
  doctorName: string;
  appointmentTime: string;
  appointmentDate: string;
  arriveByTime?: string;
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, clinicName, tokenNumber, doctorName, appointmentTime, appointmentDate, arriveByTime } = params;

  // Calculate display time (arriveByTime - 15 minutes if available, otherwise appointmentTime - 15)
  let displayTime = appointmentTime;
  try {
    const appointmentDateObj = parse(appointmentDate, 'd MMMM yyyy', new Date());
    if (arriveByTime) {
      const arriveByDateTime = parseTime(arriveByTime, appointmentDateObj);
      const displayDateTime = subMinutes(arriveByDateTime, 15);
      displayTime = format(displayDateTime, 'hh:mm a');
    } else {
      const appointmentDateTime = parseTime(appointmentTime, appointmentDateObj);
      const displayDateTime = subMinutes(appointmentDateTime, 15);
      displayTime = format(displayDateTime, 'hh:mm a');
    }
  } catch (error) {
    console.error('Error calculating display time:', error);
  }

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: 'Doctor Consultation Started',
    body: `Dr. ${doctorName} has started consultation at ${clinicName}. Your appointment time: ${displayTime}. Token: ${tokenNumber}`,
    data: {
      type: 'doctor_consultation_started',
      appointmentId,
      clinicName,
      tokenNumber,
      doctorName,
      appointmentTime: displayTime,
      appointmentDate,
      url: '/live-token',
    },
  });
}

/**
 * Notify next patients in queue when an appointment is completed
 */
export async function notifyNextPatientsWhenCompleted(params: {
  firestore: Firestore;
  completedAppointmentId: string;
  completedAppointment: Appointment;
  clinicName: string;
}): Promise<void> {
  const { firestore, completedAppointmentId, completedAppointment, clinicName } = params;

  try {
    // Get all appointments for the same doctor and date
    const appointmentsQuery = query(
      collection(firestore, 'appointments'),
      where('doctor', '==', completedAppointment.doctor),
      where('date', '==', completedAppointment.date),
      where('status', 'in', ['Pending', 'Confirmed'])
    );

    const appointmentsSnapshot = await getDocs(appointmentsQuery);
    const allAppointments = appointmentsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(apt => apt.id !== completedAppointmentId);

    // Sort by slotIndex or time
    const sortedAppointments = allAppointments.sort((a, b) => {
      if (typeof a.slotIndex === 'number' && typeof b.slotIndex === 'number') {
        return a.slotIndex - b.slotIndex;
      }
      // Fallback to time comparison
      try {
        const dateA = parse(a.date, 'd MMMM yyyy', new Date());
        const dateB = parse(b.date, 'd MMMM yyyy', new Date());
        const timeA = parseTime(a.time, dateA);
        const timeB = parseTime(b.time, dateB);
        return timeA.getTime() - timeB.getTime();
      } catch {
        return 0;
      }
    });

    // Get appointments that come after the completed one
    const completedSlotIndex = typeof completedAppointment.slotIndex === 'number' ? completedAppointment.slotIndex : -1;
    const nextAppointments = sortedAppointments.filter(apt => {
      if (typeof apt.slotIndex === 'number' && completedSlotIndex >= 0) {
        return apt.slotIndex > completedSlotIndex;
      }
      // Fallback to time comparison
      try {
        const dateCompleted = parse(completedAppointment.date, 'd MMMM yyyy', new Date());
        const dateApt = parse(apt.date, 'd MMMM yyyy', new Date());
        const timeCompleted = parseTime(completedAppointment.time, dateCompleted);
        const timeApt = parseTime(apt.time, dateApt);
        return timeApt.getTime() > timeCompleted.getTime();
      } catch {
        return false;
      }
    });

    // Send notifications to next patients (limit to first 3 to avoid spam)
    const appointmentsToNotify = nextAppointments.slice(0, 3);
    for (let i = 0; i < appointmentsToNotify.length; i++) {
      const appointment = appointmentsToNotify[i];
      const peopleAhead = i; // Number of appointments ahead (0-indexed)

      if (!appointment.patientId) continue;

      try {
        await sendPeopleAheadNotification({
          firestore,
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          clinicName,
          tokenNumber: appointment.tokenNumber,
          doctorName: appointment.doctor,
          peopleAhead,
          appointmentTime: appointment.time,
          appointmentDate: appointment.date,
        });
      } catch (error) {
        console.error(`Failed to send notification to patient ${appointment.patientId}:`, error);
        // Continue with other notifications
      }
    }
  } catch (error) {
    console.error('Error notifying next patients:', error);
  }
}

