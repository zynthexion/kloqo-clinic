
'use client';

import { useEffect } from 'react';
import { collection, doc, getDoc, writeBatch, where, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';
import type { Appointment } from '@/lib/types';
import { addHours, isAfter, parse } from 'date-fns';

function parseAppointmentDateTime(dateStr: string, timeStr: string): Date {
    // This format needs to exactly match how dates/times are stored in Firestore
    return parse(`${dateStr} ${timeStr}`, 'd MMMM yyyy hh:mm a', new Date());
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
    
    // Set up the real-time listener
    const userDocRef = doc(db, "users", currentUser.uid);
    getDoc(userDocRef).then(userDocSnap => {
        const clinicId = userDocSnap.data()?.clinicId;
        if (clinicId) {
            // Query for appointments that are potential candidates for being marked as "No-show"
            const q = query(
                collection(db, "appointments"), 
                where("clinicId", "==", clinicId),
                where("status", "in", ["Confirmed", "Skipped"])
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
