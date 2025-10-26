
import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, writeBatch, arrayUnion, serverTimestamp, getDoc } from 'firebase/firestore';
import type { Patient, User } from './types';

interface ManagePatientParams {
  phone: string;
  name: string;
  age: number;
  place: string;
  sex: 'Male' | 'Female' | 'Other' | '';
  clinicId: string;
  bookingUserId: string; // This can be the patient's own ID or the ID of the person booking for them
  bookingFor: 'self' | 'new_related' | string; // 'self', 'new_related', or ID of existing related patient
}

/**
 * Manages patient records for walk-in or new registrations.
 * - Checks for an existing user by phone number.
 * - If user exists, it updates their patient record.
 * - If user doesn't exist, it creates a new user and a new patient record.
 * - Handles adding related patients under a primary user.
 * @returns The ID of the patient record for the appointment.
 */
export async function managePatient({
  phone,
  name,
  age,
  place,
  sex,
  clinicId,
  bookingUserId,
  bookingFor,
}: ManagePatientParams): Promise<string> {
  const usersRef = collection(db, 'users');
  const patientsRef = collection(db, 'patients');
  const userQuery = query(usersRef, where('phone', '==', phone));
  const userSnapshot = await getDocs(userQuery);

  const batch = writeBatch(db);
  let patientIdForAppointment: string;

  if (!userSnapshot.empty) {
    // --- USER EXISTS ---
    const existingUser = userSnapshot.docs[0].data() as User;
    const primaryPatientId = existingUser.patientId!;
    
    if (bookingFor === 'self' || bookingFor === primaryPatientId) {
      // Booking for the primary user themselves
      const patientRef = doc(db, 'patients', primaryPatientId);
      const updateData: Partial<Patient> = { name, age, place, sex, updatedAt: serverTimestamp() };
      if (!existingUser.clinicIds?.includes(clinicId)) {
        updateData.clinicIds = arrayUnion(clinicId);
      }
      batch.update(patientRef, updateData);
      patientIdForAppointment = primaryPatientId;
    } else {
      // Booking for an existing related patient (bookingFor should be the patient's ID)
      patientIdForAppointment = bookingFor;
      const patientRef = doc(db, 'patients', patientIdForAppointment);
      batch.update(patientRef, { name, age, place, sex, updatedAt: serverTimestamp() });
    }
  } else {
    // --- NEW USER ---
    if (bookingFor === 'new_related') {
      // This is a new relative patient - we need to find the primary patient
      // The bookingUserId should contain the primary patient's ID
      const primaryPatientRef = doc(db, 'patients', bookingUserId);
      const primaryPatientSnap = await getDoc(primaryPatientRef);
      
      if (!primaryPatientSnap.exists()) {
        throw new Error('Primary patient not found for adding a relative.');
      }
      
      const primaryPatientData = primaryPatientSnap.data() as Patient;
      const newRelativePatientRef = doc(collection(db, 'patients'));
      
      patientIdForAppointment = newRelativePatientRef.id;

      const newRelativeData: Patient = {
        id: newRelativePatientRef.id,
        primaryUserId: primaryPatientData.primaryUserId, // Link to the same primary user
        name,
        age,
        place,
        sex,
        phone,
        communicationPhone: phone || primaryPatientData.communicationPhone,
        totalAppointments: 0,
        visitHistory: [],
        relatedPatientIds: [bookingUserId], // Link to the primary patient
        clinicIds: primaryPatientData.clinicIds || [clinicId],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      // Create a new user for this relative if they have a phone number
      if (phone) {
        const newUserRef = doc(collection(db, 'users'));
        const newUserData: User = {
          uid: newUserRef.id,
          phone,
          role: 'patient',
          patientId: newRelativePatientRef.id,
        };
        batch.set(newUserRef, newUserData);
      }
      
      batch.set(newRelativePatientRef, newRelativeData);
      
      // Update the primary patient to include this relative
      batch.update(primaryPatientRef, {
        relatedPatientIds: arrayUnion(newRelativePatientRef.id),
        updatedAt: serverTimestamp(),
      });
      
    } else {
      // This is a completely new patient (not a relative)
      const newUserRef = doc(collection(db, 'users'));
      const newPatientRef = doc(collection(db, 'patients'));
      
      patientIdForAppointment = newPatientRef.id;

      const newUserData: User = {
        uid: newUserRef.id,
        phone,
        role: 'patient',
        patientId: newPatientRef.id,
      };

      const newPatientData: Patient = {
        id: newPatientRef.id,
        primaryUserId: newUserRef.id,
        name,
        age,
        place,
        sex,
        phone,
        communicationPhone: phone,
        email: '',
        totalAppointments: 0,
        visitHistory: [],
        relatedPatientIds: [],
        clinicIds: [clinicId],
        isPrimary: true,
        isKloqoMember: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      batch.set(newUserRef, newUserData);
      batch.set(newPatientRef, newPatientData);
    }
  }

  await batch.commit();
  return patientIdForAppointment;
}

    