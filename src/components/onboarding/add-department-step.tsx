
"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { SelectDepartmentDialog } from "./select-department-dialog";
import type { Department } from "@/lib/types";
import Image from "next/image";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/firebase";
import { doc, setDoc, getDoc, collection, writeBatch, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

const superAdminDepartments: Department[] = [
    { id: 'dept-01', name: 'General Medicine', description: 'Comprehensive primary care.', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVkaWNpbmV8ZW58MHx8MHx8fDA%3D', doctors: [] },
    { id: 'dept-02', name: 'Cardiology', description: 'Specialized heart care.', image: 'https://images.unsplash.com/photo-1530026405182-271453396975?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjZ8fG1lZGljaW5lfGVufDB8fDB8fHww', doctors: [] },
    { id: 'dept-03', name: 'Pediatrics', description: 'Healthcare for children.', image: 'https://images.unsplash.com/photo-1599586120429-48281b6f0ece?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGNoaWxkcmVuJTIwZG9jdG9yfGVufDB8fDB8fHww', doctors: [] },
    { id: 'dept-04', name: 'Dermatology', description: 'Skin health services.', image: 'https://images.unsplash.com/photo-1631894959934-396b3a8d11b3?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGRlcm1hdG9sb2d5fGVufDB8fDB8fHww', doctors: [] },
    { id: 'dept-05', name: 'Neurology', description: 'Nervous system disorders.', image: 'https://images.unsplash.com/photo-1695423589949-c9a56f626245?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8bmV1cm9sb2d5fGVufDB8fDB8fHww', doctors: [] },
];


export function AddDepartmentStep({ onDepartmentsAdded, onAddDoctorClick }: { onDepartmentsAdded: (departments: Department[]) => void, onAddDoctorClick: () => void }) {
  const auth = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [existingDepartments, setExistingDepartments] = useState<Department[]>([]);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchExistingDepartments = async () => {
      setLoading(true);
      try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const clinicId = userDoc.data()?.clinicId;
        if (clinicId) {
            const departmentsQuery = query(collection(db, "clinics", clinicId, "departments"));
            const querySnapshot = await getDocs(departmentsQuery);
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
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const clinicId = userDoc.data()?.clinicId;
        if (!clinicId) {
            toast({ variant: "destructive", title: "Error", description: "No clinic ID found for user." });
            return;
        }

        const batch = writeBatch(db);
        departments.forEach(dept => {
            const deptRef = doc(db, `clinics/${clinicId}/departments`, dept.id);
            batch.set(deptRef, { ...dept, clinicId });
        });
        await batch.commit();
        
        const allDepts = [...existingDepartments, ...departments];
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
    return <div className="flex justify-center items-center h-full">Loading...</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
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
             <div className="flex justify-end mb-4">
                 <Button onClick={() => setIsDialogOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add More Departments
                </Button>
            </div>
            <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-md mb-6 text-left">
                <p className="font-bold">Next Step: Add a Doctor</p>
                <p>The 'Doctors' menu is now enabled. Add your first doctor to begin managing appointments.</p>
            </div>
             <div>
                <h1 className="text-2xl font-bold mb-2">Add your first doctor</h1>
                <p className="text-muted-foreground mb-6">
                    With your department set up, it's time to add a doctor to the system.
                </p>
                <Button size="lg" onClick={onAddDoctorClick}>
                    <PlusCircle className="mr-2 h-5 w-5" />
                    Add Doctor
                </Button>
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
