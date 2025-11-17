
'use client';

import { useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, writeBatch, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';
import type { Doctor, Appointment } from '@/lib/types';
import { isWithinInterval, parse, format, addMinutes } from 'date-fns';

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

function parseAppointmentDateTime(appointment: Appointment, fallback: Date): Date | null {
  try {
    if (appointment.date && appointment.time) {
      return parse(`${appointment.date} ${appointment.time}`, 'd MMMM yyyy hh:mm a', fallback);
    }
    if (appointment.date) {
      return parse(appointment.date, 'd MMMM yyyy', fallback);
    }
  } catch (error) {
    console.error('Failed to parse appointment date/time', appointment.id, error);
  }
  return null;
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
        const appointmentsQuery = query(
          collection(db, "appointments"),
          where("clinicId", "==", clinicId),
          where("status", "==", "Confirmed")
        );
        const [doctorsSnapshot, appointmentsSnapshot] = await Promise.all([
          getDocs(doctorsQuery),
          getDocs(appointmentsQuery)
        ]);
        const doctors = doctorsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Doctor));
        const now = new Date();
        const todayStr = format(now, 'd MMMM yyyy');
        const todaysConfirmedAppointments = appointmentsSnapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Appointment))
          .filter(appt => appt.date === todayStr);
        const appointmentsByDoctor = new Map<string, Appointment[]>();
        const pushAppointment = (key: string | undefined | null, appointment: Appointment) => {
          if (!key) return;
          const existing = appointmentsByDoctor.get(key) ?? [];
          existing.push(appointment);
          appointmentsByDoctor.set(key, existing);
        };
        todaysConfirmedAppointments.forEach(appt => {
          if (appt.doctorId) {
            pushAppointment(appt.doctorId, appt);
          } else if (appt.doctor) {
            pushAppointment(`name:${appt.doctor}`, appt);
          }
        });
        
        const batch = writeBatch(db);
        const todayDay = format(now, 'EEEE'); // e.g., 'Monday', 'Tuesday'

        let batchHasWrites = false;

        // Only auto-set to 'Out' if doctor is currently 'In' and outside availability
        // 'In' status is now manual only
        for (const doctor of doctors) {
          const todaysAvailability = doctor.availabilitySlots?.find(s => 
            s.day.toLowerCase() === todayDay.toLowerCase()
          );
          
          let shouldBeOut = false;
          if (todaysAvailability && todaysAvailability.timeSlots?.length > 0) {
            const isWithinAnySlot = todaysAvailability.timeSlots.some(slot => {
              try {
                const startTime = parseTime(slot.from, now);
                const endTime = parseTime(slot.to, now);
                return isWithinInterval(now, { start: startTime, end: endTime });
              } catch (error) {
                console.error(`Error checking slot for doctor ${doctor.name}:`, error);
                return false;
              }
            });
            shouldBeOut = !isWithinAnySlot;
          } else {
            // No availability slots = should be out
            shouldBeOut = true;
          }

          if (shouldBeOut) {
            const doctorAppointments =
              appointmentsByDoctor.get(doctor.id) ??
              appointmentsByDoctor.get(`name:${doctor.name}`) ??
              [];

            if (doctorAppointments.length > 0) {
              if (doctorAppointments.length > 1) {
                shouldBeOut = false;
              } else {
                const appointmentDateTime = parseAppointmentDateTime(doctorAppointments[0], now);
                if (appointmentDateTime) {
                  const avgConsultingTime = Math.max(Number(doctor.averageConsultingTime) || 15, 5);
                  const graceDeadline = addMinutes(appointmentDateTime, avgConsultingTime * 2);
                  if (now <= graceDeadline) {
                    shouldBeOut = false;
                  }
                } else {
                  // Could not parse appointment time, give benefit of doubt
                  shouldBeOut = false;
                }
              }
            }
          }
          
          // Only auto-set to 'Out', never auto-set to 'In'
          if (doctor.consultationStatus === 'In' && shouldBeOut) {
            const doctorRef = doc(db, 'doctors', doctor.id);
            batch.update(doctorRef, { 
              consultationStatus: 'Out',
              updatedAt: new Date()
            });
            batchHasWrites = true;
            console.log(`Auto-updating doctor ${doctor.name} status from In to Out (outside availability)`);
          }
        }

        if (batchHasWrites) {
          await batch.commit();
          console.log(`Successfully updated doctors' consultation statuses`);
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
