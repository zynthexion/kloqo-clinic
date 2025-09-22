
"use client";

import React, { useState } from "react";
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
    <div className="flex flex-col">
      <OnboardingSidebar step={step} />
      <main className="flex-1 p-4 sm:p-6">
        {step === 1 && <AddDepartmentStep onDepartmentsAdded={handleDepartmentsAdded} />}
        {step === 2 && selectedDepartments.length > 0 && <AddDoctorStep departments={selectedDepartments} onDoctorAdded={handleDoctorAdded} />}
        {step === 3 && (
            <div className="flex flex-col items-center justify-center h-full text-center bg-background p-8 rounded-lg">
              <h1 className="text-3xl font-bold text-primary mb-4">Onboarding Complete!</h1>
              <p className="text-lg text-muted-foreground mb-8">
                  You have successfully set up your clinic. You are now ready to manage appointments.
              </p>
              <div className="mt-8 space-y-4 text-left max-w-md mx-auto">
                  <div>
                      <h3 className="font-semibold text-lg mb-2">Your Departments:</h3>
                      <ul className="list-disc list-inside text-muted-foreground">
                          {selectedDepartments.map(d => <li key={d.id}>{d.name}</li>)}
                      </ul>
                  </div>
                  {addedDoctor && (
                      <div>
                          <h3 className="font-semibold text-lg mt-4 mb-2">Your First Doctor:</h3>
                          <p className="text-muted-foreground"><span className="font-semibold">{addedDoctor.name}</span> ({addedDoctor.specialty})</p>
                      </div>
                  )}
              </div>
          </div>
        )}
      </main>
    </div>
  );
}

    