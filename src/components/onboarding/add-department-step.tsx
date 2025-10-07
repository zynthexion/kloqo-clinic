
"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { SelectDepartmentDialog } from "./select-department-dialog";
import type { Department } from "@/lib/types";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/firebase";
import { doc, setDoc, getDoc, collection, writeBatch, getDocs, query, where, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Skeleton } from "../ui/skeleton";
import { FirestorePermissionError } from "@/firebase/errors";
import { errorEmitter } from "@/firebase/error-emitter";


export function AddDepartmentStep({ onDepartmentsAdded, onAddDoctorClick }: { onDepartmentsAdded: (departments: Department[]) => void, onAddDoctorClick: () => void }) {
  const auth = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [clinicDepartments, setClinicDepartments] = useState<Department[]>([]);
  const [masterDepartments, setMasterDepartments] = useState<Department[]>([]);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const masterDeptsSnapshot = await getDocs(collection(db, "master-departments"));
        const masterDeptsList = masterDeptsSnapshot.docs.map(d => d.data() as Department);
        setMasterDepartments(masterDeptsList);

        const userDoc = await getDoc(doc(db, "users", auth.currentUser!.uid));
        if (!userDoc.exists()) {
          setLoading(false);
          return;
        }

        const clinicId = userDoc.data()?.clinicId;
        if (clinicId) {
          const clinicDoc = await getDoc(doc(db, "clinics", clinicId));
          if(clinicDoc.exists()){
            const clinicData = clinicDoc.data();
            const departmentIds: string[] = clinicData.departments || [];
            
            if (departmentIds.length > 0) {
                const depts = masterDeptsList.filter(masterDept => departmentIds.includes(masterDept.id));
                setClinicDepartments(depts);
                onDepartmentsAdded(depts);
                onAddDoctorClick(); 
            }
          }
        }
      } catch (error) {
        console.error("Error fetching initial department data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [auth.currentUser, onDepartmentsAdded, onAddDoctorClick]);


  const handleSelectDepartments = async (selectedDepts: Department[]) => {
    if (!auth.currentUser) {
        toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
        return;
    }
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const clinicId = userDoc.data()?.clinicId;
    if (!clinicId) {
        toast({ variant: "destructive", title: "Error", description: "No clinic ID found for user." });
        return;
    }

    const clinicRef = doc(db, "clinics", clinicId);
    const departmentIdsToAdd = selectedDepts.map(d => d.id);

    updateDoc(clinicRef, {
        departments: arrayUnion(...departmentIdsToAdd)
    })
    .then(() => {
        const allDepts = [...clinicDepartments, ...selectedDepts].reduce((acc, current) => {
            if (!acc.find(item => item.id === current.id)) {
                acc.push(current);
            }
            return acc;
        }, [] as Department[]);

        setClinicDepartments(allDepts);
        onDepartmentsAdded(allDepts);

        toast({
            title: "Departments Added",
            description: `${selectedDepts.length} department(s) have been added to your clinic.`,
        });
    })
    .catch((serverError) => {
        console.error("Error updating clinic with departments:", serverError);
        const permissionError = new FirestorePermissionError({
            path: `/clinics/${clinicId}`,
            operation: 'update',
            requestResourceData: { departments: departmentIdsToAdd },
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };
  
  if (loading) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center w-full max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">Select your initial departments</h1>
            <p className="text-muted-foreground mb-6">
                Add one or more departments to your clinic to begin using the application.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full mt-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center w-full">
      {clinicDepartments.length === 0 ? (
        <>
          <h1 className="text-2xl font-bold mb-2">Select your initial departments</h1>
          <p className="text-muted-foreground mb-6">
            Add one or more departments to your clinic to begin using the application.
          </p>
          <Button size="lg" onClick={() => setIsDialogOpen(true)}>
            <PlusCircle className="mr-2 h-5 w-5" />
            Add Departments
          </Button>
        </>
      ) : (
        <div className="w-full max-w-4xl">
            <div className="mb-8">
                <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-md mb-6 text-left w-full">
                    <p className="font-bold">Departments Added!</p>
                    <p>You have successfully added departments. The next step is to add doctors.</p>
                </div>
                <h2 className="text-xl font-semibold text-left mb-4">Your Departments ({clinicDepartments.length})</h2>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {clinicDepartments.map((dept) => (
                        <Card key={dept.id} className="text-left overflow-hidden">
                            <div className="relative h-32 w-full">
                                <Image src={dept.image} alt={dept.name} fill style={{objectFit: 'cover'}} data-ai-hint={dept.imageHint || 'clinic department'} />
                            </div>
                            <CardContent className="p-4">
                                <p className="font-semibold">{dept.name}</p>
                                <p className="text-xs text-muted-foreground">{dept.description}</p>
                            </CardContent>
                        </Card>
                    ))}
                 </div>
            </div>
            
            <div className="flex flex-col items-center gap-4">
                <h1 className="text-2xl font-bold">Next Step: Add a Doctor</h1>
                <p className="text-muted-foreground">
                    With your department set up, it's time to add a doctor to the system.
                </p>
                <div className="flex items-center gap-4">
                    <Button size="lg" onClick={onAddDoctorClick}>
                        <PlusCircle className="mr-2 h-5 w-5" />
                        Add Doctor
                    </Button>
                     <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Additional Departments
                    </Button>
                </div>
            </div>
        </div>
      )}

      <SelectDepartmentDialog
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        departments={masterDepartments}
        onDepartmentsSelect={handleSelectDepartments}
      />
    </div>
  );
}
