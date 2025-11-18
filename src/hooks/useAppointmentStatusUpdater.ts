
'use client';

import { useEffect } from 'react';
import { collection, doc, getDoc, writeBatch, where, query, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
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

// Update appointments with doctor delay: add delay to cutOffTime and noShowTime
// When doctor is not 'In' after consultation start time, delay is calculated and added to all appointments
// Status transitions (Pending → Skipped → No-show) use the delayed cutOffTime/noShowTime
async function updateAppointmentsWithDelay(
  clinicId: string,
  doctorId: string,
  totalDelayMinutes: number
): Promise<void> {
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
    
    try {
      if (!appointment.time || !appointment.date) {
        console.warn(`Appointment ${doc.id} missing time or date, skipping delay update`);
        return;
      }

      // Parse appointment date and time
      const appointmentDate = parse(appointment.date, 'd MMMM yyyy', new Date());
      const appointmentTime = parseTime(appointment.time, appointmentDate);
      
      // Always calculate from base times (appointment time - 15 for cutOff, + 15 for noShow)
      // Then add the current delay amount
      const baseCutOffTime = subMinutes(appointmentTime, 15);
      const baseNoShowTime = addMinutes(appointmentTime, 15);
      
      // Add delay to base times (if delay is 0, times remain at base)
      const delayedCutOffTime = addMinutes(baseCutOffTime, totalDelayMinutes);
      const delayedNoShowTime = addMinutes(baseNoShowTime, totalDelayMinutes);
      
      // Update with delayed times and store delay amount
      const updates: any = {
        cutOffTime: Timestamp.fromDate(delayedCutOffTime),
        noShowTime: Timestamp.fromDate(delayedNoShowTime),
        doctorDelayMinutes: totalDelayMinutes
      };

      batch.update(doc.ref, updates);
      hasWrites = true;
      updatedCount++;
      
    } catch (error) {
      console.warn(`Error updating appointment ${doc.id} with delay:`, error);
    }
  });

  if (hasWrites) {
    try {
      await batch.commit();
      console.log(`[Delay Update] Updated ${updatedCount} appointments with ${totalDelayMinutes} minute doctor delay (stored separately, original cutOffTime/noShowTime preserved for status transitions)`);
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
          if (apt.status === 'Pending') {
            // Use stored cutOffTime from Firestore (original, never delayed)
            let cutOffTime: Date;
            if (apt.cutOffTime) {
              // Convert Firestore timestamp to Date
              cutOffTime = apt.cutOffTime instanceof Date 
                ? apt.cutOffTime 
                : apt.cutOffTime?.toDate 
                  ? apt.cutOffTime.toDate() 
                  : new Date(apt.cutOffTime);
            } else {
              // Fallback: calculate if not stored (for old appointments)
          const appointmentDate = parse(apt.date, 'd MMMM yyyy', new Date());
          const appointmentTime = parseTime(apt.time, appointmentDate);
              cutOffTime = subMinutes(appointmentTime, 15);
            }
            
            // Check if current time is greater than stored cutOffTime
            if (isAfter(now, cutOffTime) || now.getTime() >= cutOffTime.getTime()) {
              const aptRef = doc(db, 'appointments', apt.id);
              batch.update(aptRef, { 
                status: 'Skipped',
                skippedAt: new Date(),
                updatedAt: new Date()
              });
              hasWrites = true;
              console.log(`Auto-updating appointment ${apt.id} from Pending to Skipped (cutOffTime: ${cutOffTime.toISOString()}, now: ${now.toISOString()})`);
            }
          } else if (apt.status === 'Skipped') {
            // Use stored noShowTime from Firestore (includes doctor delay if any)
            let noShowTime: Date;
            if (apt.noShowTime) {
              // Convert Firestore timestamp to Date
              noShowTime = apt.noShowTime instanceof Date 
                ? apt.noShowTime 
                : apt.noShowTime?.toDate 
                  ? apt.noShowTime.toDate() 
                  : new Date(apt.noShowTime);
            } else {
              // Fallback: calculate if not stored (for old appointments)
              const appointmentDate = parse(apt.date, 'd MMMM yyyy', new Date());
              const appointmentTime = parseTime(apt.time, appointmentDate);
              noShowTime = addMinutes(appointmentTime, 15);
            }
            
            // Check if current time is greater than stored noShowTime
            if (isAfter(now, noShowTime) || now.getTime() >= noShowTime.getTime()) {
            const aptRef = doc(db, 'appointments', apt.id);
              batch.update(aptRef, { 
                status: 'No-show',
                updatedAt: new Date()
              });
            hasWrites = true;
              console.log(`Auto-updating appointment ${apt.id} from Skipped to No-show (noShowTime: ${noShowTime.toISOString()}, now: ${now.toISOString()})`);
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

    // Function to check and update appointment delays based on doctor consultation status
    // Calculates total delay (minutes since consultation start while doctor is not 'In')
    // and applies it to all appointments' cutOffTime and noShowTime
    // This ensures correct delays even if the app was closed and reopened
    const checkAndUpdateDelays = async (clinicId: string) => {
      try {
        const doctorsRef = collection(db, 'doctors');
        const q = query(doctorsRef, where('clinicId', '==', clinicId));
        const doctorsSnapshot = await getDocs(q);
      const now = new Date();

        for (const doctorDoc of doctorsSnapshot.docs) {
          const doctor = { id: doctorDoc.id, ...doctorDoc.data() } as Doctor;
          const { delayMinutes, availabilityStartTime } = calculateDoctorDelay(doctor, now);
          
          // Only add delay if doctor is not 'In' and availability has started
          if (delayMinutes > 0 && availabilityStartTime) {
            // Check if we're still within the consultation window
            const currentDay = format(now, 'EEEE');
            const todaysAvailability = doctor.availabilitySlots?.find(
              slot => slot.day.toLowerCase() === currentDay.toLowerCase()
      );
      
            if (todaysAvailability && todaysAvailability.timeSlots?.length > 0) {
              // Get the last session end time to check if we're still in consultation window
              const lastSession = todaysAvailability.timeSlots[todaysAvailability.timeSlots.length - 1];
              let availabilityEndTime: Date;
              try {
                availabilityEndTime = parseTime(lastSession.to, now);
              } catch {
                continue; // Skip if we can't parse end time
              }
              
              // Only apply delay if we're still within the consultation window
              if (isBefore(now, availabilityEndTime) || now.getTime() === availabilityEndTime.getTime()) {
                // Store doctor delay separately (for display only)
                // Status transitions (Pending → Skipped → No-show) always use ORIGINAL cutOffTime/noShowTime
                await updateAppointmentsWithDelay(
                  clinicId,
                  doctor.id,
                  delayMinutes // Total delay in minutes (stored in doctorDelayMinutes field)
                );
                console.log(`[Delay Update] Added ${delayMinutes} minute doctor delay to appointments for doctor ${doctor.name} (consultation started at ${format(availabilityStartTime, 'hh:mm a')}, current time: ${format(now, 'hh:mm a')}). Delay added to cutOffTime and noShowTime.`);
              } else {
                // Consultation window has ended, clear the delay
                await updateAppointmentsWithDelay(clinicId, doctor.id, 0);
              }
            }
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

            // Set up real-time listener for doctor status changes
            // This ensures delays stop immediately when doctor goes 'In'
            const doctorsRef = collection(db, 'doctors');
            const doctorsQuery = query(doctorsRef, where('clinicId', '==', clinicId));
            const doctorsUnsubscribe = onSnapshot(doctorsQuery, (doctorsSnapshot) => {
                // When doctor status changes, immediately recalculate delays
                // If doctor goes 'In', delays will stop; if doctor goes 'Out' during consultation, delays will resume
                checkAndUpdateDelays(clinicId);
            });

            // Set an interval to re-run the check periodically, as a fallback for time passing
            // Reduced to 30 seconds for more responsive updates while app is open
            const intervalId = setInterval(() => {
                // Re-fetch to check for time-based status changes
                getDocs(q).then(snapshot => {
                    const appointmentsToCheck = snapshot.docs.map(doc => ({ 
                        id: doc.id, 
                        ...doc.data() 
                    } as Appointment));
                    checkAndUpdateStatuses(appointmentsToCheck);
                });
                // Check and update appointment delays based on doctor consultation status
                checkAndUpdateDelays(clinicId);
            }, 30000); // Check every 30 seconds for more responsive updates while app is open

            // Cleanup function
            return () => {
                unsubscribe();
                doctorsUnsubscribe();
                clearInterval(intervalId);
            };
        }
    });

  }, [currentUser]);
}
