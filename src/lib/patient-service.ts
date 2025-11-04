
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

      // Check if the phone number matches primary patient's phone (duplicate check)
      const primaryPhone = primaryPatientData.phone || primaryPatientData.communicationPhone;
      const isDuplicatePhone = phone && phone.trim().length > 0 && primaryPhone && 
          phone.replace(/^\+91/, '') === primaryPhone.replace(/^\+91/, '');

      let newRelativeData: Patient;
      
      if (phone && phone.trim().length > 0 && !isDuplicatePhone) {
        // If relative has unique phone number, check if phone is unique across ALL patients
        const patientsRef = collection(db, 'patients');
        const patientPhoneQuery = query(patientsRef, where("phone", "==", phone));
        const patientPhoneSnapshot = await getDocs(patientPhoneQuery);

        if (!patientPhoneSnapshot.empty) {
          throw new Error("This phone number is already registered to another patient.");
        }

        // Check users collection as well
        const usersRef = collection(db, 'users');
        const userQuery = query(usersRef, where("phone", "==", phone));
        const userSnapshot = await getDocs(userQuery);

        if (!userSnapshot.empty) {
          throw new Error("This phone number is already registered to another user.");
        }

        // Create user document
        const newUserRef = doc(collection(db, 'users'));
        const newUserData: User = {
          uid: newUserRef.id,
          phone,
          role: 'patient',
          patientId: newRelativePatientRef.id,
        };
        batch.set(newUserRef, newUserData);

        // If relative has phone, they become PRIMARY patient themselves
        newRelativeData = {
          id: newRelativePatientRef.id,
          primaryUserId: newUserRef.id, // Their own user ID since they're primary
          name,
          place,
          phone: phone, // Set phone field
          communicationPhone: phone, // Set communication phone
          isPrimary: true, // They become primary since they have a phone
          relatedPatientIds: [], // Empty array - they're primary, relatives will be added later
          totalAppointments: 0,
          visitHistory: [],
          clinicIds: primaryPatientData.clinicIds || [clinicId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as any;
        
        // Only add age and sex if they have values (Firestore doesn't allow undefined)
        if (age !== undefined && age !== null) {
          newRelativeData.age = age;
        }
        if (sex) {
          newRelativeData.sex = sex;
        }
      } else {
        // If duplicate phone or no phone provided, use primary patient's communication phone
        newRelativeData = {
          id: newRelativePatientRef.id,
          primaryUserId: primaryPatientData.primaryUserId, // Link to the same primary user
          name,
          place,
          phone: '', // Explicitly set to empty string
          communicationPhone: primaryPatientData.communicationPhone || primaryPatientData.phone,
          isPrimary: false,
          totalAppointments: 0,
          visitHistory: [],
          // Relatives should NOT have relatedPatientIds - only primary patients have this field
          clinicIds: primaryPatientData.clinicIds || [clinicId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as any;
        
        // Only add age and sex if they have values (Firestore doesn't allow undefined)
        if (age !== undefined && age !== null) {
          newRelativeData.age = age;
        }
        if (sex) {
          newRelativeData.sex = sex;
        }
        
        // NO user document created for duplicate phone
      }
      
      // Remove undefined values - Firestore doesn't allow undefined
      const cleanedRelativeData = Object.fromEntries(
        Object.entries(newRelativeData).filter(([_, v]) => v !== undefined)
      );
      batch.set(newRelativePatientRef, cleanedRelativeData);

      // Always add to primary's relatedPatientIds, regardless of whether relative has a phone
      // Even if relative has a unique phone and becomes isPrimary: true, they are still a relative of the primary patient
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

      const newPatientData: any = {
        id: newPatientRef.id,
        primaryUserId: newUserRef.id,
        name,
        place,
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
      
      // Only add age and sex if they have values (Firestore doesn't allow undefined)
      if (age !== undefined && age !== null) {
        newPatientData.age = age;
      }
      if (sex) {
        newPatientData.sex = sex;
      }
      
      // Remove undefined values - Firestore doesn't allow undefined
      const cleanedPatientData = Object.fromEntries(
        Object.entries(newPatientData).filter(([_, v]) => v !== undefined)
      );
      
      batch.set(newUserRef, newUserData);
      batch.set(newPatientRef, cleanedPatientData);
    }
  }

  await batch.commit();
  return patientIdForAppointment;
}

    