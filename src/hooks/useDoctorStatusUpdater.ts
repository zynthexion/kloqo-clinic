
'use client';

import { useState, useEffect } from 'react';
import { collection, doc, getDocs, query, writeBatch, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';
import type { Doctor } from '@/lib/types';
import { isWithinInterval, parse } from 'date-fns';

function parseTime(timeStr: string, date: Date): Date {
    return parse(timeStr, 'hh:mm a', date);
}

export function useDoctorStatusUpdater() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    const updateStatuses = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        const clinicId = userDoc.data()?.clinicId;
        if (!clinicId) return;

        const doctorsQuery = query(collection(db, "doctors"), where("clinicId", "==", clinicId));
        const doctorsSnapshot = await getDocs(doctorsQuery);
        const doctors = doctorsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));
        
        const batch = writeBatch(db);
        const now = new Date();
        const todayDay = now.toLocaleString('en-US', { weekday: 'long' });

        let batchHasWrites = false;

        for (const doctor of doctors) {
          const todaysAvailability = doctor.availabilitySlots?.find(s => s.day === todayDay);
          let isCurrentlyAvailable = false;
          if (todaysAvailability) {
            isCurrentlyAvailable = todaysAvailability.timeSlots.some(slot => {
              const startTime = parseTime(slot.from, now);
              const endTime = parseTime(slot.to, now);
              return isWithinInterval(now, { start: startTime, end: endTime });
            });
          }
          
          const newStatus = isCurrentlyAvailable ? 'In' : 'Out';

          if (doctor.consultationStatus !== newStatus) {
            const doctorRef = doc(db, 'doctors', doctor.id);
            batch.update(doctorRef, { consultationStatus: newStatus });
            batchHasWrites = true;
          }
        }

        if (batchHasWrites) {
          await batch.commit();
        }
      } catch (error) {
        console.error("Error updating doctor consultation statuses:", error);
      }
    };

    updateStatuses();
    const intervalId = setInterval(updateStatuses, 60000); // Check every minute

    return () => clearInterval(intervalId);
  }, [currentUser]);
}
