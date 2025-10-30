
'use client';

import { useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, writeBatch, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';
import type { Doctor } from '@/lib/types';
import { isWithinInterval, parse, format } from 'date-fns';

/**
 * Parses time string to Date object, handling both "hh:mm a" and "HH:mm" formats
 */
function parseTime(timeStr: string, date: Date): Date {
  try {
    // Try parsing "hh:mm a" format first (e.g., "9:00 AM", "01:00 PM")
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      return parse(timeStr, 'hh:mm a', date);
    }
    // Try parsing "HH:mm" format (e.g., "09:00", "13:00")
    const parsed = parse(timeStr, 'HH:mm', date);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    // Fallback: try "h:mm a" format
    return parse(timeStr, 'h:mm a', date);
  } catch (error) {
    console.error('Error parsing time:', timeStr, error);
    // Fallback: return current date if parsing fails
    return date;
  }
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
        const todayDay = format(now, 'EEEE'); // e.g., 'Monday', 'Tuesday'

        let batchHasWrites = false;

        for (const doctor of doctors) {
          const todaysAvailability = doctor.availabilitySlots?.find(s => 
            s.day.toLowerCase() === todayDay.toLowerCase()
          );
          let isCurrentlyAvailable = false;
          if (todaysAvailability && todaysAvailability.timeSlots?.length > 0) {
            isCurrentlyAvailable = todaysAvailability.timeSlots.some(slot => {
              try {
                const startTime = parseTime(slot.from, now);
                const endTime = parseTime(slot.to, now);
                return isWithinInterval(now, { start: startTime, end: endTime });
              } catch (error) {
                console.error(`Error checking slot for doctor ${doctor.name}:`, error);
                return false;
              }
            });
          }
          
          const newStatus = isCurrentlyAvailable ? 'In' : 'Out';

          if (doctor.consultationStatus !== newStatus) {
            const doctorRef = doc(db, 'doctors', doctor.id);
            batch.update(doctorRef, { 
              consultationStatus: newStatus,
              updatedAt: new Date()
            });
            batchHasWrites = true;
            console.log(`Updating doctor ${doctor.name} status from ${doctor.consultationStatus} to ${newStatus}`);
          }
        }

        if (batchHasWrites) {
          await batch.commit();
          console.log(`Successfully updated ${doctors.length} doctors' consultation statuses`);
        }
      } catch (error) {
        console.error("Error updating doctor consultation statuses:", error);
      }
    };

    // Run immediately on mount and then every 2 minutes
    updateStatuses();
    const intervalId = setInterval(updateStatuses, 120000); // Check every 2 minutes

    return () => clearInterval(intervalId);
  }, [currentUser]);
}
