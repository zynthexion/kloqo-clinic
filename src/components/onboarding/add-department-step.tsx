
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
import { doc, setDoc, getDoc, collection, writeBatch, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Skeleton } from "../ui/skeleton";

const superAdminDepartments: Department[] = [
    { id: 'dept-01', clinicId: '', name: 'General Medicine', description: 'Comprehensive primary care.', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVkaWNpbmV8ZW58MHx8MHx8fDA%3D', imageHint: "stethoscope pills", doctors: [] },
    { id: 'dept-02', clinicId: '', name: 'Cardiology', description: 'Specialized heart care.', image: 'https://images.unsplash.com/photo-1530026405182-271453396975?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjZ8fG1lZGljaW5lfGVufDB8fDB8fHww', imageHint: "heart model", doctors: [] },
    { id: 'dept-03', clinicId: '', name: 'Pediatrics', description: 'Healthcare for children.', image: 'https://images.unsplash.com/photo-1599586120429-48281b6f0ece?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGNoaWxkcmVuJTIwZG9jdG9yfGVufDB8fDB8fHww', imageHint: "doctor baby", doctors: [] },
    { id: 'dept-04', clinicId: '', name: 'Dermatology', description: 'Skin health services.', image: 'https://images.unsplash.com/photo-1631894959934-396b3a8d11b3?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGRlcm1hdG9sb2d5fGVufDB8fDB8fHww', imageHint: "skin care", doctors: [] },
    { id: 'dept-05', clinicId: '', name: 'Neurology', description: 'Nervous system disorders.', image: 'https://images.unsplash.com/photo-1695423589949-c9a56f626245?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8bmV1cm9sb2d5fGVufDB8fDB8fHww', imageHint: "brain model", doctors: [] },
];


export function AddDepartmentStep({ onDepartmentsAdded, onAddDoctorClick }: { onDepartmentsAdded: (departments: Department[]) => void, onAddDoctorClick: () => void }) {
  const auth = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [existingDepartments, setExistingDepartments] = useState<Department[]>([]);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) {
        setLoading(false);
        return;
    }

    const fetchExistingDepartments = async () => {
      setLoading(true);
      try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser!.uid));
        const clinicId = userDoc.data()?.clinicId;
        if (clinicId) {
            const departmentsRef = collection(db, 'clinics', clinicId, 'departments');
            const q = query(departmentsRef);
            const querySnapshot = await getDocs(q);
            const depts = querySnapshot.docs.map(d => d.data() as Department);
            setExistingDepartments(depts);
            if (depts.length > 0) {
              onDepartmentsAdded(depts);
            }
        }
      } catch (error) {
        console.error("Error fetching existing departments:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchExistingDepartments();
  }, [auth.currentUser, onDepartmentsAdded]);


  const handleSelectDepartments = async (departments: Department[]) => {
    if (!auth.currentUser) {
        toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
        return;
    }
    try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser!.uid));
        const clinicId = userDoc.data()?.clinicId;
        if (!clinicId) {
            toast({ variant: "destructive", title: "Error", description: "No clinic ID found for user." });
            return;
        }

        const batch = writeBatch(db);
        departments.forEach(dept => {
            const deptRef = doc(db, "clinics", clinicId, "departments", dept.id);
            batch.set(deptRef, { ...dept, clinicId });
        });
        await batch.commit();
        
        const allDepts = [...existingDepartments, ...departments].reduce((acc, current) => {
            if (!acc.find(item => item.id === current.id)) {
                acc.push(current);
            }
            return acc;
        }, [] as Department[]);

        setExistingDepartments(allDepts);
        onDepartmentsAdded(allDepts);

        toast({
            title: "Departments Added",
            description: `${departments.length} department(s) have been added to your clinic.`,
        });

    } catch (error) {
        console.error("Error saving departments:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to save departments. Please try again.",
        });
    }
  };
  
  if (loading) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center w-full max-w-4xl mx-auto">
            <Skeleton className="h-8 w-1/2 mb-4" />
            <Skeleton className="h-6 w-3/4 mb-6" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center w-full">
      {existingDepartments.length === 0 ? (
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
                <h2 className="text-xl font-semibold text-left mb-4">Your Departments ({existingDepartments.length})</h2>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {existingDepartments.map((dept) => (
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
        departments={superAdminDepartments}
        onDepartmentsSelect={handleSelectDepartments}
      />
    </div>
  );
}
