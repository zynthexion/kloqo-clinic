
'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, writeBatch, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';
import type { Appointment } from '@/lib/types';
import { addHours, isAfter, parse } from 'date-fns';
import { useToast } from './use-toast';

function parseAppointmentDateTime(dateStr: string, timeStr: string): Date {
    return parse(`${dateStr} ${timeStr}`, 'd MMMM yyyy hh:mm a', new Date());
}

export function useAppointmentStatusUpdater() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Effect to listen for real-time appointment updates
  useEffect(() => {
    if (!currentUser) return;

    const fetchInitialData = async () => {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        const clinicId = userDocSnap.data()?.clinicId;

        if (clinicId) {
            const q = query(collection(db, "appointments"), where("clinicId", "==", clinicId));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const appointmentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
                setAppointments(appointmentsData);
            });
            return unsubscribe;
        }
    };
    
    const unsubscribePromise = fetchInitialData();

    return () => {
      unsubscribePromise.then(unsubscribe => {
        if (unsubscribe) {
          unsubscribe();
        }
      });
    };
  }, [currentUser]);


  // Effect to check and update statuses periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      if (appointments.length === 0) return;

      const now = new Date();
      const batch = writeBatch(db);
      let batchHasWrites = false;

      const appointmentsToCheck = appointments.filter(apt => apt.status === 'Confirmed' || apt.status === 'Skipped');
      
      for (const apt of appointmentsToCheck) {
        try {
          const appointmentDateTime = parseAppointmentDateTime(apt.date, apt.time);
          const fiveHoursLater = addHours(appointmentDateTime, 5);
          
          if (isAfter(now, fiveHoursLater)) {
            const aptRef = doc(db, 'appointments', apt.id);
            batch.update(aptRef, { status: 'No-show' });
            batchHasWrites = true;
          }
        } catch (e) {
          // Ignore parsing errors for potentially malformed old data
          continue;
        }
      }
      
      if (batchHasWrites) {
        try {
          await batch.commit();
          console.log("Appointment statuses updated automatically.");
          // Optionally, show a subtle toast
          // toast({
          //     title: "Queue Cleaned",
          //     description: "Old appointments were marked as No-show."
          // });
        } catch (e) {
          console.error("Error in automatic status update batch:", e);
        }
      }

    }, 300000); // Check every 5 minutes

    return () => clearInterval(interval);
  }, [appointments, toast]);
}
