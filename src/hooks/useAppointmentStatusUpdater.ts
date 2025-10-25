
'use client';

import { useEffect } from 'react';
import { collection, doc, getDoc, writeBatch, where, query, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';
import type { Appointment, Doctor } from '@/lib/types';
import { addHours, isAfter, parse, format } from 'date-fns';

function parseAppointmentDateTime(dateStr: string, timeStr: string): Date {
    // This format needs to exactly match how dates/times are stored in Firestore
    return parse(`${dateStr} ${timeStr}`, 'd MMMM yyyy hh:mm a', new Date());
}

function shouldDoctorBeOut(doctor: Doctor, currentDay: string, currentTime: string): boolean {
  // If doctor is already marked as 'Out', don't change
  if (doctor.consultationStatus === 'Out') {
    return false;
  }
  
  // If no availability slots, mark as 'Out'
  if (!doctor.availabilitySlots || doctor.availabilitySlots.length === 0) {
    return true;
  }
  
  // Find today's availability slot
  const todaySlot = doctor.availabilitySlots.find(slot => 
    slot.day.toLowerCase() === currentDay.toLowerCase()
  );
  
  if (!todaySlot || !todaySlot.timeSlots || todaySlot.timeSlots.length === 0) {
    return true;
  }
  
  // Check if current time is within any of the doctor's time slots
  const isWithinAnySlot = todaySlot.timeSlots.some(slot => {
    return isTimeWithinSlot(currentTime, slot.from, slot.to);
  });
  
  return !isWithinAnySlot;
}

function isTimeWithinSlot(currentTime: string, slotStart: string, slotEnd: string): boolean {
  try {
    const [currentHour, currentMinute] = currentTime.split(':').map(Number);
    const [startHour, startMinute] = slotStart.split(':').map(Number);
    const [endHour, endMinute] = slotEnd.split(':').map(Number);
    
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch (error) {
    console.error('Error checking time within slot:', error);
    return false;
  }
}

export function useAppointmentStatusUpdater() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    // This function will be called by the snapshot listener
    const checkAndApplyNoShowStatus = async (appointments: Appointment[]) => {
      if (appointments.length === 0) return;

      const now = new Date();
      const batch = writeBatch(db);
      let hasWrites = false;

      // The snapshot already filters for 'Confirmed' and 'Skipped',
      // so we just need to check the time.
      for (const apt of appointments) {
        try {
          const appointmentDateTime = parseAppointmentDateTime(apt.date, apt.time);
          const fiveHoursLater = addHours(appointmentDateTime, 5);

          if (isAfter(now, fiveHoursLater)) {
            const aptRef = doc(db, 'appointments', apt.id);
            batch.update(aptRef, { status: 'No-show' });
            hasWrites = true;
          }
        } catch (e) {
          // Ignore parsing errors for potentially malformed old data
          console.warn(`Could not parse date/time for appointment ${apt.id}:`, e);
          continue;
        }
      }
      
      if (hasWrites) {
        try {
          await batch.commit();
          console.log("Appointment statuses automatically updated to No-show.");
        } catch (e) {
          console.error("Error in automatic status update batch:", e);
        }
      }
    };

    // Function to check and update doctor consultation statuses
    const checkAndUpdateDoctorStatuses = async (clinicId: string) => {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');
      const currentDay = format(now, 'EEEE'); // e.g., 'Monday', 'Tuesday'
      
      // Query all doctors for this clinic
      const doctorsRef = collection(db, 'doctors');
      const q = query(
        doctorsRef,
        where('clinicId', '==', clinicId)
      );
      
      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      let hasWrites = false;
      
      querySnapshot.forEach((docSnapshot) => {
        const doctor = docSnapshot.data() as Doctor;
        
        // Check if doctor should be marked as 'Out'
        if (shouldDoctorBeOut(doctor, currentDay, currentTime)) {
          const doctorRef = doc(db, 'doctors', docSnapshot.id);
          batch.update(doctorRef, { 
            consultationStatus: 'Out',
            updatedAt: new Date()
          });
          hasWrites = true;
        }
      });
      
      if (hasWrites) {
        try {
          await batch.commit();
          console.log("Doctor consultation statuses automatically updated to Out.");
        } catch (e) {
          console.error("Error in automatic doctor status update batch:", e);
        }
      }
    };
    
    // Set up the real-time listener
    const userDocRef = doc(db, "users", currentUser.uid);
    getDoc(userDocRef).then(userDocSnap => {
        const clinicId = userDocSnap.data()?.clinicId;
        if (clinicId) {
            // Run doctor status update immediately when app opens
            checkAndUpdateDoctorStatuses(clinicId);
            
            // Query for appointments that are potential candidates for being marked as "No-show"
            const q = query(
                collection(db, "appointments"), 
                where("clinicId", "==", clinicId),
                where("status", "in", ["Confirmed", "Pending", "Cancelled", "No-show", "Skipped"])
            );

            // Listen for real-time changes
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const appointmentsToCheck = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
                checkAndApplyNoShowStatus(appointmentsToCheck);
            });

            // Set an interval to re-run the check periodically, as a fallback for time passing
            const intervalId = setInterval(() => {
                // Re-fetch just in case, though onSnapshot should be primary
                getDocs(q).then(snapshot => {
                    const appointmentsToCheck = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
                    checkAndApplyNoShowStatus(appointmentsToCheck);
                });
                // Also check doctor statuses periodically
                checkAndUpdateDoctorStatuses(clinicId);
            }, 300000); // Check every 5 minutes

            // Cleanup function
            return () => {
                unsubscribe();
                clearInterval(intervalId);
            };
        }
    });

  }, [currentUser]);
}
