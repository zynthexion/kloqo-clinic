

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AddDepartmentStep } from "@/components/onboarding/add-department-step";
import { AddDoctorStep } from "@/components/onboarding/add-doctor-step";
import { Department, Doctor } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [selectedDepartments, setSelectedDepartments] = useState<Department[]>([]);
  const router = useRouter();

  const handleDepartmentsAdded = (departments: Department[]) => {
    setSelectedDepartments(departments);
    setStep(2);
  };
  
  const handleDoctorAdded = () => {
      setStep(3);
  }

  return (
    <>
      <main className="flex-1 p-4 sm:p-6">
        {step === 1 && <AddDepartmentStep onDepartmentsAdded={handleDepartmentsAdded} />}
        {step === 2 && selectedDepartments.length > 0 && <AddDoctorStep departments={selectedDepartments} onDoctorAdded={handleDoctorAdded} />}
        {step === 3 && (
            <div className="flex flex-col items-center justify-center h-full text-center bg-background p-8 rounded-lg">
              <h1 className="text-3xl font-bold text-primary mb-4">Onboarding Complete!</h1>
              <p className="text-lg text-muted-foreground mb-8">
                  You have successfully set up your clinic. You are now ready to manage your dashboard.
              </p>
              <Button onClick={() => router.push('/')}>Go to Dashboard</Button>
          </div>
        )}
      </main>
    </>
  );
}
