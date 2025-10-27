/**
 * Notification Service for Nurse App
 * Sends notifications to patients when appointments are created
 */

import { Firestore, doc, getDoc } from 'firebase/firestore';

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
  date: string;
  time: string;
  tokenNumber: string;
  bookedBy: 'nurse' | 'admin';
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, doctorName, date, time, tokenNumber, bookedBy } = params;

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: 'Appointment Booked',
    body: `${bookedBy === 'nurse' ? 'Nurse' : 'Clinic staff'} has booked an appointment with Dr. ${doctorName} on ${date} at ${time}. Token: ${tokenNumber}`,
    data: {
      type: 'appointment_confirmed',
      appointmentId,
      doctorName,
      date,
      time,
      tokenNumber,
      bookedBy,
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
}): Promise<boolean> {
  const { firestore, patientId, appointmentId, doctorName, clinicName, oldTime, newTime, reason } = params;

  return sendNotificationToPatient({
    firestore,
    patientId,
    title: 'Appointment Time Changed',
    body: `${clinicName} has rescheduled your appointment with Dr. ${doctorName} from ${oldTime} to ${newTime}.${reason ? ` Reason: ${reason}` : ''}`,
    data: {
      type: 'appointment_rescheduled',
      appointmentId,
      doctorName,
      clinicName,
      oldTime,
      newTime,
      reason,
    },
  });
}

