"use client";

import React, { useState } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { OnboardingSidebar } from "@/components/onboarding/onboarding-sidebar";
import { AddDepartmentStep } from "@/components/onboarding/add-department-step";
import { AddDoctorStep } from "@/components/onboarding/add-doctor-step";
import { Department, Doctor } from "@/lib/types";

export default function OnboardingDemoPage() {
  const [step, setStep] = useState(1);
  const [selectedDepartments, setSelectedDepartments] = useState<Department[]>([]);
  const [addedDoctor, setAddedDoctor] = useState<Doctor | null>(null);

  const handleDepartmentsAdded = (departments: Department[]) => {
    setSelectedDepartments(departments);
    setStep(2);
  };
  
  const handleDoctorAdded = (doctor: Doctor) => {
      setAddedDoctor(doctor);
      setStep(3);
  }

  return (
    <>
      <OnboardingSidebar step={step} />
      <SidebarInset>
        <main className="flex-1 p-4 sm:p-6">
          {step === 1 && <AddDepartmentStep onDepartmentsAdded={handleDepartmentsAdded} />}
          {step === 2 && selectedDepartments.length > 0 && <AddDoctorStep department={selectedDepartments[0]} onDoctorAdded={handleDoctorAdded} />}
          {step === 3 && selectedDepartments.length > 0 && addedDoctor && (
             <div className="flex flex-col items-center justify-center h-full text-center bg-background p-8 rounded-lg">
                <h1 className="text-3xl font-bold text-primary mb-4">Onboarding Complete!</h1>
                <p className="text-lg text-muted-foreground">
                    You have successfully added your first departments and a doctor.
                </p>
                <div className="mt-8 space-y-4">
                    <div>
                        <p className="font-semibold">Departments:</p>
                        <ul className="list-disc list-inside text-muted-foreground">
                            {selectedDepartments.map(d => <li key={d.id}>{d.name}</li>)}
                        </ul>
                    </div>
                    <p>Doctor: <span className="font-semibold">{addedDoctor.name}</span></p>
                </div>
            </div>
          )}
        </main>
      </SidebarInset>
    </>
  );
}
