"use client";

import React, { useState } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { OnboardingSidebar } from "@/components/onboarding/onboarding-sidebar";
import { AddDepartmentStep } from "@/components/onboarding/add-department-step";
import { AddDoctorStep } from "@/components/onboarding/add-doctor-step";
import { Department, Doctor } from "@/lib/types";

export default function OnboardingDemoPage() {
  const [step, setStep] = useState(1);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [addedDoctor, setAddedDoctor] = useState<Doctor | null>(null);

  const handleDepartmentAdded = (department: Department) => {
    setSelectedDepartment(department);
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
          {step === 1 && <AddDepartmentStep onDepartmentAdded={handleDepartmentAdded} />}
          {step === 2 && selectedDepartment && <AddDoctorStep department={selectedDepartment} onDoctorAdded={handleDoctorAdded} />}
          {step === 3 && selectedDepartment && addedDoctor && (
             <div className="flex flex-col items-center justify-center h-full text-center bg-background p-8 rounded-lg">
                <h1 className="text-3xl font-bold text-primary mb-4">Onboarding Complete!</h1>
                <p className="text-lg text-muted-foreground">
                    You have successfully added your first department and doctor.
                </p>
                <div className="mt-8 space-y-4">
                    <p>Department: <span className="font-semibold">{selectedDepartment.name}</span></p>
                    <p>Doctor: <span className="font-semibold">{addedDoctor.name}</span></p>
                </div>
            </div>
          )}
        </main>
      </SidebarInset>
    </>
  );
}