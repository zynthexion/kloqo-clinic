
'use client';

import { useEffect } from 'react';
import { collection, doc, getDoc, writeBatch, where, query, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';
import type { Appointment, Doctor } from '@/lib/types';
import { addMinutes, isAfter, parse, format, subMinutes, differenceInMinutes, isBefore } from 'date-fns';

function parseAppointmentDateTime(dateStr: string, timeStr: string): Date {
    // This format needs to exactly match how dates/times are stored in Firestore
    return parse(`${dateStr} ${timeStr}`, 'd MMMM yyyy hh:mm a', new Date());
}

// Helper function to parse time string
function parseTime(timeStr: string, referenceDate: Date): Date {
  try {
    return parse(timeStr, 'hh:mm a', referenceDate);
  } catch {
    // Fallback to 24h format
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date(referenceDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }
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

// Calculate doctor delay: minutes since availability start while doctor is not 'In'
function calculateDoctorDelay(
  doctor: Doctor,
  now: Date
): { delayMinutes: number; availabilityStartTime: Date | null } {
  const currentDay = format(now, 'EEEE');
  const todaysAvailability = doctor.availabilitySlots?.find(
    slot => slot.day.toLowerCase() === currentDay.toLowerCase()
  );

  if (!todaysAvailability || !todaysAvailability.timeSlots?.length) {
    return { delayMinutes: 0, availabilityStartTime: null };
  }

  // Get the first session start time (when availability begins)
  const firstSession = todaysAvailability.timeSlots[0];
  let availabilityStartTime: Date;
  try {
    availabilityStartTime = parseTime(firstSession.from, now);
  } catch (error) {
    console.warn(`Error parsing availability start time for doctor ${doctor.name}:`, error);
    return { delayMinutes: 0, availabilityStartTime: null };
  }

  // If current time is before availability starts, no delay
  if (isBefore(now, availabilityStartTime)) {
    return { delayMinutes: 0, availabilityStartTime: null };
  }

  // If doctor is already 'In', no delay
  if (doctor.consultationStatus === 'In') {
    return { delayMinutes: 0, availabilityStartTime: null };
  }

  // Calculate delay: minutes since availability started while doctor is not 'In'
  const delayMinutes = differenceInMinutes(now, availabilityStartTime);
  
  return { 
    delayMinutes: Math.max(0, delayMinutes), 
    availabilityStartTime 
  };
}

// Update appointments with delay: add delay to noShowTime and cutOffTime
async function updateAppointmentsWithDelay(
  clinicId: string,
  doctorId: string,
  delayMinutes: number
): Promise<void> {
  if (delayMinutes <= 0) return;

  const today = format(new Date(), 'd MMMM yyyy');
  const appointmentsRef = collection(db, 'appointments');
  const q = query(
    appointmentsRef,
    where('clinicId', '==', clinicId),
    where('doctorId', '==', doctorId),
    where('date', '==', today),
    where('status', 'in', ['Pending', 'Confirmed', 'Skipped'])
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  let hasWrites = false;
  let updatedCount = 0;

  snapshot.forEach((doc) => {
    const appointment = doc.data() as Appointment;
    
    // Parse current noShowTime and cutOffTime
    let currentNoShowTime: Date | null = null;
    let currentCutOffTime: Date | null = null;

    try {
      // Handle noShowTime
      if (appointment.noShowTime) {
        if (appointment.noShowTime instanceof Date) {
          currentNoShowTime = appointment.noShowTime;
        } else if (typeof (appointment.noShowTime as any).toDate === 'function') {
          currentNoShowTime = (appointment.noShowTime as any).toDate();
        } else if ((appointment.noShowTime as any).seconds) {
          currentNoShowTime = new Date((appointment.noShowTime as any).seconds * 1000);
        } else if (typeof appointment.noShowTime === 'string') {
          // Try parsing as date string
          const parsed = new Date(appointment.noShowTime);
          if (!isNaN(parsed.getTime())) {
            currentNoShowTime = parsed;
          }
        }
      }

      // Handle cutOffTime
      if (appointment.cutOffTime) {
        if (appointment.cutOffTime instanceof Date) {
          currentCutOffTime = appointment.cutOffTime;
        } else if (typeof (appointment.cutOffTime as any).toDate === 'function') {
          currentCutOffTime = (appointment.cutOffTime as any).toDate();
        } else if ((appointment.cutOffTime as any).seconds) {
          currentCutOffTime = new Date((appointment.cutOffTime as any).seconds * 1000);
        } else if (typeof appointment.cutOffTime === 'string') {
          // Try parsing as date string
          const parsed = new Date(appointment.cutOffTime);
          if (!isNaN(parsed.getTime())) {
            currentCutOffTime = parsed;
          }
        }
      }

      // If we have the times, add delay
      if (currentNoShowTime || currentCutOffTime) {
        const updates: any = {};
        
        if (currentNoShowTime) {
          const newNoShowTime = addMinutes(currentNoShowTime, delayMinutes);
          updates.noShowTime = newNoShowTime;
        }
        
        if (currentCutOffTime) {
          const newCutOffTime = addMinutes(currentCutOffTime, delayMinutes);
          updates.cutOffTime = newCutOffTime;
        }

        if (Object.keys(updates).length > 0) {
          batch.update(doc.ref, updates);
          hasWrites = true;
          updatedCount++;
        }
      }
    } catch (error) {
      console.warn(`Error updating appointment ${doc.id} with delay:`, error);
    }
  });

  if (hasWrites) {
    try {
      await batch.commit();
      console.log(`[Delay Update] Updated ${updatedCount} appointments with ${delayMinutes} minute delay for doctor ${doctorId}`);
    } catch (error) {
      console.error('Error committing delay updates:', error);
    }
  }
}

export function useAppointmentStatusUpdater() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    // This function handles both Pending → Skipped and Skipped → No-show transitions
    const checkAndUpdateStatuses = async (appointments: Appointment[]) => {
      if (appointments.length === 0) return;

      const now = new Date();
      const batch = writeBatch(db);
      let hasWrites = false;

      // Check both Pending and Skipped appointments
      const appointmentsToCheck = appointments.filter(apt => 
        apt.status === 'Pending' || apt.status === 'Skipped'
      );
      
      for (const apt of appointmentsToCheck) {
        try {
          // Parse appointment date and time
          const appointmentDate = parse(apt.date, 'd MMMM yyyy', new Date());
          const appointmentTime = parseTime(apt.time, appointmentDate);
          
          if (apt.status === 'Pending') {
            // Check if 15 minutes before appointment (cut-off time) has passed
            const confirmDeadline = subMinutes(appointmentTime, 15);
            if (isAfter(now, confirmDeadline)) {
              const aptRef = doc(db, 'appointments', apt.id);
              batch.update(aptRef, { 
                status: 'Skipped',
                skippedAt: new Date(),
                updatedAt: new Date()
              });
              hasWrites = true;
              console.log(`Auto-updating appointment ${apt.id} from Pending to Skipped`);
            }
          } else if (apt.status === 'Skipped') {
            // Check if appointment time + 15 minutes has passed
            const noShowTime = addMinutes(appointmentTime, 15);
            if (isAfter(now, noShowTime)) {
              const aptRef = doc(db, 'appointments', apt.id);
              batch.update(aptRef, { 
                status: 'No-show',
                updatedAt: new Date()
              });
              hasWrites = true;
              console.log(`Auto-updating appointment ${apt.id} from Skipped to No-show`);
            }
          }
        } catch (e) {
          // Ignore parsing errors for potentially malformed old data
          console.warn(`Could not process appointment ${apt.id}:`, e);
          continue;
        }
      }
      
      if (hasWrites) {
        try {
          await batch.commit();
          console.log("Appointment statuses automatically updated.");
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

    // Function to check and update appointment delays based on doctor consultation status
    // Adds 1 minute delay per check (every minute) while doctor is not 'In'
    const checkAndUpdateDelays = async (clinicId: string) => {
      try {
        const doctorsRef = collection(db, 'doctors');
        const q = query(doctorsRef, where('clinicId', '==', clinicId));
        const doctorsSnapshot = await getDocs(q);
        const now = new Date();

        for (const doctorDoc of doctorsSnapshot.docs) {
          const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as Doctor;
          const { delayMinutes } = calculateDoctorDelay(doctor, now);
          
          // Only add delay if doctor is not 'In' and availability has started
          // Add 1 minute per check (incremental) to avoid compounding
          if (delayMinutes > 0) {
            // Add 1 minute delay (incremental, not total)
            await updateAppointmentsWithDelay(
              clinicId,
              doctor.id,
              1 // Add 1 minute per check
            );
          }
        }
      } catch (error) {
        console.error('Error updating appointment delays:', error);
      }
    };
    
    // Set up the real-time listener
    const userDocRef = doc(db, "users", currentUser.uid);
    getDoc(userDocRef).then(userDocSnap => {
        const clinicId = userDocSnap.data()?.clinicId;
        if (clinicId) {
            // Run doctor status update immediately when app opens
            checkAndUpdateDoctorStatuses(clinicId);
            
            // Query for both Pending and Skipped appointments
            const q = query(
                collection(db, "appointments"), 
                where("clinicId", "==", clinicId),
                where("status", "in", ["Pending", "Skipped"])
            );

            // Run immediately on mount to check current statuses
            getDocs(q).then(snapshot => {
                const appointmentsToCheck = snapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data() 
                } as Appointment));
                checkAndUpdateStatuses(appointmentsToCheck);
            });

            // Listen for real-time changes
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const appointmentsToCheck = snapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data() 
                } as Appointment));
                checkAndUpdateStatuses(appointmentsToCheck);
            });

            // Run delay check immediately on mount
            checkAndUpdateDelays(clinicId);

            // Set an interval to re-run the check periodically, as a fallback for time passing
            const intervalId = setInterval(() => {
                // Re-fetch to check for time-based status changes
                getDocs(q).then(snapshot => {
                    const appointmentsToCheck = snapshot.docs.map(doc => ({ 
                        id: doc.id, 
                        ...doc.data() 
                    } as Appointment));
                    checkAndUpdateStatuses(appointmentsToCheck);
                });
                // Also check doctor statuses periodically
                checkAndUpdateDoctorStatuses(clinicId);
                // Check and update appointment delays based on doctor consultation status
                checkAndUpdateDelays(clinicId);
            }, 60000); // Check every 1 minute (more frequent for better responsiveness)

            // Cleanup function
            return () => {
                unsubscribe();
                clearInterval(intervalId);
            };
        }
    });

  }, [currentUser]);
}
