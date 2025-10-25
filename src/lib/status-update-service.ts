import { collection, query, where, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parse, addHours, isAfter, isBefore, isWithinInterval } from 'date-fns';
import type { Appointment, Doctor } from '@/lib/types';

/**
 * Updates appointment statuses and doctor consultation statuses when the app opens
 */
export async function updateAppointmentAndDoctorStatuses(clinicId: string): Promise<void> {
  try {
    console.log('Starting status updates for clinic:', clinicId);
    
    // Update appointment statuses
    await updateAppointmentStatuses(clinicId);
    
    // Update doctor consultation statuses
    await updateDoctorConsultationStatuses(clinicId);
    
    console.log('Status updates completed successfully');
  } catch (error) {
    console.error('Error updating statuses:', error);
    throw error;
  }
}

/**
 * Updates appointment statuses to 'No-show' for appointments that are 5+ hours past their appointment time
 */
async function updateAppointmentStatuses(clinicId: string): Promise<void> {
  const now = new Date();
  const fiveHoursAgo = addHours(now, -5);
  
  console.log('Checking appointments for status updates...', {
    now: now.toISOString(),
    fiveHoursAgo: fiveHoursAgo.toISOString()
  });
  
  // Query appointments that need status updates
  const appointmentsRef = collection(db, 'appointments');
  const q = query(
    appointmentsRef,
    where('clinicId', '==', clinicId),
    where('status', 'in', ['Confirmed', 'Pending', 'Cancelled', 'No-show', 'Skipped'])
  );
  
  const querySnapshot = await getDocs(q);
  console.log(`Found ${querySnapshot.size} appointments to check`);
  
  const appointmentsToUpdate: { id: string; appointment: Appointment }[] = [];
  
  querySnapshot.forEach((docSnapshot) => {
    const appointment = docSnapshot.data() as Appointment;
    const appointmentDateTime = parseAppointmentDateTime(appointment.date, appointment.time);
    
    console.log('Checking appointment:', {
      id: docSnapshot.id,
      patientName: appointment.patientName,
      date: appointment.date,
      time: appointment.time,
      status: appointment.status,
      appointmentDateTime: appointmentDateTime?.toISOString(),
      isBeforeFiveHoursAgo: appointmentDateTime ? isBefore(appointmentDateTime, fiveHoursAgo) : false
    });
    
    if (appointmentDateTime && isBefore(appointmentDateTime, fiveHoursAgo)) {
      appointmentsToUpdate.push({ id: docSnapshot.id, appointment });
    }
  });
  
  console.log(`Found ${appointmentsToUpdate.length} appointments to update to No-show`);
  
  if (appointmentsToUpdate.length > 0) {
    console.log(`Updating ${appointmentsToUpdate.length} appointments to No-show status`);
    
    // Use batch update for better performance
    const batch = writeBatch(db);
    
    appointmentsToUpdate.forEach(({ id }) => {
      const appointmentRef = doc(db, 'appointments', id);
      batch.update(appointmentRef, { 
        status: 'No-show',
        updatedAt: new Date()
      });
    });
    
    await batch.commit();
    console.log(`Successfully updated ${appointmentsToUpdate.length} appointments to No-show`);
  }
}

/**
 * Updates doctor consultation status to 'Out' if current time is outside their availability
 */
async function updateDoctorConsultationStatuses(clinicId: string): Promise<void> {
  const now = new Date();
  const currentTime = format(now, 'HH:mm');
  const currentDay = format(now, 'EEEE'); // e.g., 'Monday', 'Tuesday'
  
  console.log('Checking doctors for status updates...', {
    currentTime,
    currentDay,
    now: now.toISOString()
  });
  
  // Query all doctors for this clinic
  const doctorsRef = collection(db, 'doctors');
  const q = query(
    doctorsRef,
    where('clinicId', '==', clinicId)
  );
  
  const querySnapshot = await getDocs(q);
  console.log(`Found ${querySnapshot.size} doctors to check`);
  
  const doctorsToUpdate: { id: string; doctor: Doctor; newStatus: 'In' | 'Out' }[] = [];
  
  querySnapshot.forEach((docSnapshot) => {
    const doctor = docSnapshot.data() as Doctor;
    
    console.log('Checking doctor:', {
      id: docSnapshot.id,
      name: doctor.name,
      currentStatus: doctor.consultationStatus,
      availabilitySlots: doctor.availabilitySlots?.length || 0,
      rawAvailabilitySlots: doctor.availabilitySlots
    });
    
    // Check if doctor should be marked as 'Out'
    const shouldBeOut = shouldDoctorBeOut(doctor, currentDay, currentTime);
    const shouldBeIn = !shouldBeOut;
    
    // Only update if status needs to change
    if (shouldBeOut && doctor.consultationStatus !== 'Out') {
      doctorsToUpdate.push({ id: docSnapshot.id, doctor, newStatus: 'Out' });
      console.log(`Doctor ${doctor.name} should be marked as Out`);
    } else if (shouldBeIn && doctor.consultationStatus !== 'In') {
      doctorsToUpdate.push({ id: docSnapshot.id, doctor, newStatus: 'In' });
      console.log(`Doctor ${doctor.name} should be marked as In`);
    } else {
      console.log(`Doctor ${doctor.name} status is correct (${doctor.consultationStatus})`);
    }
  });
  
  console.log(`Found ${doctorsToUpdate.length} doctors to update`);
  
  if (doctorsToUpdate.length > 0) {
    console.log(`Updating ${doctorsToUpdate.length} doctors`);
    
    // Use batch update for better performance
    const batch = writeBatch(db);
    
    doctorsToUpdate.forEach(({ id, doctor, newStatus }) => {
      const doctorRef = doc(db, 'doctors', id);
      batch.update(doctorRef, { 
        consultationStatus: newStatus,
        updatedAt: new Date()
      });
      console.log(`Updating doctor ${doctor.name} to ${newStatus}`);
    });
    
    await batch.commit();
    console.log(`Successfully updated ${doctorsToUpdate.length} doctors`);
  }
}

/**
 * Parses appointment date and time into a Date object
 */
function parseAppointmentDateTime(dateStr: string, timeStr: string): Date | null {
  try {
    // Parse date in "d MMMM yyyy" format (e.g., "15 October 2024")
    const appointmentDate = parse(dateStr, "d MMMM yyyy", new Date());
    
    // Parse time - handle both "HH:mm" and "h:mm a" formats
    let hours: number, minutes: number;
    
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      // Parse time in "h:mm a" format (e.g., "2:30 PM")
      const timePart = timeStr.replace(/\s*(AM|PM)/i, '');
      const [h, m] = timePart.split(':').map(Number);
      const isPM = /PM/i.test(timeStr);
      hours = isPM ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
      minutes = m;
    } else {
      // Parse time in "HH:mm" format (e.g., "14:30")
      const [h, m] = timeStr.split(':').map(Number);
      hours = h;
      minutes = m;
    }
    
    appointmentDate.setHours(hours, minutes, 0, 0);
    
    return appointmentDate;
  } catch (error) {
    console.error('Error parsing appointment date/time:', error, { dateStr, timeStr });
    return null;
  }
}

/**
 * Determines if a doctor should be marked as 'Out' based on their availability
 */
function shouldDoctorBeOut(doctor: Doctor, currentDay: string, currentTime: string): boolean {
  console.log('Checking if doctor should be out:', {
    doctorName: doctor.name,
    currentDay,
    currentTime,
    currentStatus: doctor.consultationStatus,
    availabilitySlots: doctor.availabilitySlots?.length || 0
  });
  
  // If no availability slots, mark as 'Out'
  if (!doctor.availabilitySlots || doctor.availabilitySlots.length === 0) {
    console.log('No availability slots found, marking as Out');
    return true;
  }
  
  // Find today's availability slot
  const todaySlot = doctor.availabilitySlots.find(slot => 
    slot.day.toLowerCase() === currentDay.toLowerCase()
  );
  
  console.log('Today slot found:', {
    found: !!todaySlot,
    day: todaySlot?.day,
    timeSlots: todaySlot?.timeSlots?.length || 0
  });
  
  if (!todaySlot || !todaySlot.timeSlots || todaySlot.timeSlots.length === 0) {
    console.log('No time slots for today, marking as Out');
    return true;
  }
  
  // Check if current time is within any of the doctor's time slots
  const isWithinAnySlot = todaySlot.timeSlots.some(slot => {
    const isWithin = isTimeWithinSlot(currentTime, slot.from, slot.to);
    console.log('Checking slot:', { from: slot.from, to: slot.to, isWithin });
    return isWithin;
  });
  
  console.log('Final result:', { isWithinAnySlot, shouldBeOut: !isWithinAnySlot });
  return !isWithinAnySlot;
}

/**
 * Checks if a time is within a time slot
 */
function isTimeWithinSlot(currentTime: string, slotStart: string, slotEnd: string): boolean {
  try {
  console.log('Checking time within slot:', { currentTime, slotStart, slotEnd });
  
  // Parse current time (already in HH:mm format)
  const [currentHour, currentMinute] = currentTime.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMinute;
  
  // Parse slot times - handle both "HH:mm" and "h:mm a" formats
  const startMinutes = parseTimeToMinutes(slotStart);
  const endMinutes = parseTimeToMinutes(slotEnd);
  
  const isWithin = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  
  console.log('Parsed times:', { 
    currentTime,
    slotStart,
    slotEnd,
    currentMinutes, 
    startMinutes, 
    endMinutes, 
    isWithin
  });
  
  // Special test for Saturday 9 AM - 1 PM case
  if (slotStart === "09:00 AM" && slotEnd === "01:00 PM") {
    console.log('Saturday slot test:', {
      currentTime,
      expectedStartMinutes: 540, // 9 AM
      expectedEndMinutes: 780,   // 1 PM (13:00)
      actualStartMinutes: startMinutes,
      actualEndMinutes: endMinutes,
      currentMinutes,
      shouldBeWithin: currentMinutes >= 540 && currentMinutes <= 780
    });
  }
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch (error) {
    console.error('Error checking time within slot:', error, { currentTime, slotStart, slotEnd });
    return false;
  }
}

/**
 * Parses time string to minutes since midnight
 */
function parseTimeToMinutes(timeStr: string): number {
  try {
    console.log('Parsing time:', timeStr);
    
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      // Parse time in "h:mm a" format (e.g., "9:00 AM", "01:00 PM")
      const timePart = timeStr.replace(/\s*(AM|PM)/i, '');
      const [h, m] = timePart.split(':').map(Number);
      const isPM = /PM/i.test(timeStr);
      
      let hours: number;
      if (isPM) {
        // PM: 12 PM stays 12, 1-11 PM become 13-23
        hours = h === 12 ? 12 : h + 12;
      } else {
        // AM: 12 AM becomes 0, 1-11 AM stay 1-11
        hours = h === 12 ? 0 : h;
      }
      
      const minutes = hours * 60 + m;
      console.log('Parsed AM/PM time:', { timeStr, h, m, isPM, hours, minutes });
      return minutes;
    } else {
      // Parse time in "HH:mm" format (e.g., "09:00")
      const [h, m] = timeStr.split(':').map(Number);
      const minutes = h * 60 + m;
      console.log('Parsed 24h time:', { timeStr, h, m, minutes });
      return minutes;
    }
  } catch (error) {
    console.error('Error parsing time to minutes:', error, { timeStr });
    return 0;
  }
}

/**
 * Updates a single appointment status
 */
export async function updateSingleAppointmentStatus(
  appointmentId: string, 
  status: 'Confirmed' | 'Pending' | 'Cancelled' | 'Completed' | 'No-show' | 'Skipped'
): Promise<void> {
  try {
    const appointmentRef = doc(db, 'appointments', appointmentId);
    await updateDoc(appointmentRef, { 
      status,
      updatedAt: new Date()
    });
    console.log(`Updated appointment ${appointmentId} to ${status}`);
  } catch (error) {
    console.error('Error updating appointment status:', error);
    throw error;
  }
}

/**
 * Updates a single doctor consultation status
 */
export async function updateSingleDoctorStatus(
  doctorId: string, 
  consultationStatus: 'In' | 'Out'
): Promise<void> {
  try {
    const doctorRef = doc(db, 'doctors', doctorId);
    await updateDoc(doctorRef, { 
      consultationStatus,
      updatedAt: new Date()
    });
    console.log(`Updated doctor ${doctorId} to ${consultationStatus}`);
  } catch (error) {
    console.error('Error updating doctor status:', error);
    throw error;
  }
}
