
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AddDepartmentStep } from "@/components/onboarding/add-department-step";
import type { Department, Doctor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AddDoctorForm } from "@/components/doctors/add-doctor-form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [selectedDepartments, setSelectedDepartments] = useState<Department[]>([]);
  const [isAddDoctorOpen, setIsAddDoctorOpen] = useState(false);
  const router = useRouter();
  const auth = useAuth();
  const { toast } = useToast();

  const handleDepartmentsAdded = (departments: Department[]) => {
    setSelectedDepartments(departments);
  };
  
  const handleAddDoctorClick = () => {
      setIsAddDoctorOpen(true);
  }

  const handleDoctorAdded = (doctor: Doctor) => {
      setStep(3); // Move to completion step
  }

  const handleSaveDoctor = async (doctorData: Omit<Doctor, 'id' | 'avatar' | 'schedule' | 'preferences' | 'historicalData' | 'clinicId'> & { photo?: File; id?: string }) => {
    if (!auth.currentUser) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
        return;
    }

    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const clinicId = userDoc.data()?.clinicId;
    if (!clinicId) {
        toast({ variant: "destructive", title: "Clinic not found", description: "This user is not associated with a clinic." });
        return;
    }

    let photoUrl = `https://picsum.photos/seed/new-doc-${Date.now()}/100/100`;
    if (doctorData.photo instanceof File) {
        const storageRef = ref(storage, `doctor_avatars/${Date.now()}_${doctorData.photo.name}`);
        await uploadBytes(storageRef, doctorData.photo);
        photoUrl = await getDownloadURL(storageRef);
    }

    const docId = `doc-${Date.now()}`;
    const newDoctor: Doctor = {
      id: docId,
      clinicId: clinicId,
      name: doctorData.name,
      specialty: doctorData.specialty,
      avatar: photoUrl,
      schedule: 'Not set',
      preferences: 'Not set',
      historicalData: 'No data',
      department: doctorData.department,
      availability: 'Available',
      bio: doctorData.bio,
      averageConsultingTime: doctorData.averageConsultingTime,
      availabilitySlots: doctorData.availabilitySlots,
    };
    
    const docRef = doc(db, "clinics", clinicId, "doctors", docId);
    setDoc(docRef, newDoctor)
      .then(() => {
        handleDoctorAdded(newDoctor);

        toast({
          title: "First Doctor Added!",
          description: `${doctorData.name} has been added. You can now proceed.`,
        });
        setIsAddDoctorOpen(false);
      })
      .catch((serverError) => {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'create',
            requestResourceData: newDoctor,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const handleCompletion = async () => {
    if (!auth.currentUser) return;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    try {
        await updateDoc(userRef, { onboarded: true });
        router.push('/dashboard');
    } catch (error) {
        console.error("Failed to update onboarding status: ", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not finalize onboarding. Please try again."
        })
    }
  }

  return (
    <>
      <main className="flex-1 p-4 sm:p-6">
        {step < 3 && (
            <AddDepartmentStep onDepartmentsAdded={handleDepartmentsAdded} onAddDoctorClick={handleAddDoctorClick} />
        )}
        {step === 3 && (
            <div className="flex flex-col items-center justify-center h-full text-center bg-background p-8 rounded-lg">
              <h1 className="text-3xl font-bold text-primary mb-4">Onboarding Complete!</h1>
              <p className="text-lg text-muted-foreground mb-8">
                  You have successfully set up your clinic. You are now ready to manage your dashboard.
              </p>
              <Button onClick={handleCompletion}>Go to Dashboard</Button>
          </div>
        )}
      </main>

      <AddDoctorForm
        onSave={handleSaveDoctor as any}
        isOpen={isAddDoctorOpen}
        setIsOpen={setIsAddDoctorOpen}
        doctor={null}
        departments={selectedDepartments}
      />
    </>
  );
}
