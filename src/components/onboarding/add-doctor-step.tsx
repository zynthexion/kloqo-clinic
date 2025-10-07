
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import type { Department, Doctor } from "@/lib/types";
import { AddDoctorForm } from "@/components/doctors/add-doctor-form";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { setDoc, doc, collection, getDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

export function AddDoctorStep({ departments, onDoctorAdded }: { departments: Department[], onDoctorAdded: (doctor: Doctor) => void }) {
  const auth = useAuth();
  const [isAddDoctorOpen, setIsAddDoctorOpen] = useState(true);
  const [addedDoctor, setAddedDoctor] = useState<Doctor | null>(null);
  const { toast } = useToast();

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
        setAddedDoctor(newDoctor);
        onDoctorAdded(newDoctor);

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
  
  if (addedDoctor) {
      return (
        <div className="w-full max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4 text-center">Your First Doctor</h2>
             <Card>
                <CardHeader className="flex-row items-start justify-between">
                    <div className="flex items-center gap-4">
                        <Image
                            src={addedDoctor.avatar}
                            alt={addedDoctor.name}
                            width={48}
                            height={48}
                            className="rounded-full object-cover"
                            data-ai-hint="doctor portrait"
                        />
                        <div>
                            <CardTitle className="text-lg">{addedDoctor.name}</CardTitle>
                            <p className="text-sm text-muted-foreground">{addedDoctor.specialty}</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">Department</p>
                        <p className="text-sm">{addedDoctor.department}</p>
                    </div>
                     <div className="space-y-1">
                        <p className="text-xs font-medium uppercase text-muted-foreground">Bio</p>
                        <p className="text-sm text-muted-foreground h-12 overflow-hidden">{addedDoctor.bio}</p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Badge
                        variant={"success"}
                        className="w-full justify-center"
                    >
                        Added
                    </Badge>
                </CardFooter>
            </Card>
        </div>
      )
  }


  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-md mb-6 w-full max-w-2xl">
            <p className="font-bold">Next Step: Add a Doctor</p>
            <p>The 'Doctors' menu is now enabled. Add your first doctor to begin managing appointments.</p>
        </div>

      <h1 className="text-2xl font-bold mb-2">Add your first doctor</h1>
      <p className="text-muted-foreground mb-6">
        With your department set up, it's time to add a doctor to the system.
      </p>
      
      <AddDoctorForm
        onSave={handleSaveDoctor as any}
        isOpen={isAddDoctorOpen}
        setIsOpen={setIsAddDoctorOpen}
        doctor={null}
        departments={departments}
      />
    </div>
  );
}
