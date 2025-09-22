"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { SelectDepartmentDialog } from "./select-department-dialog";
import type { Department } from "@/lib/types";
import Image from "next/image";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const superAdminDepartments: Department[] = [
    { id: 'dept-01', name: 'General Medicine', description: 'Comprehensive primary care.', image: 'https://picsum.photos/seed/gm/600/400', imageHint: 'stethoscope pills', doctors: [] },
    { id: 'dept-02', name: 'Cardiology', description: 'Specialized heart care.', image: 'https://picsum.photos/seed/cardio/600/400', imageHint: 'heart model', doctors: [] },
    { id: 'dept-03', name: 'Pediatrics', description: 'Healthcare for children.', image: 'https://picsum.photos/seed/peds/600/400', imageHint: 'doctor baby', doctors: [] },
    { id: 'dept-04', name: 'Dermatology', description: 'Skin health services.', image: 'https://picsum.photos/seed/derma/600/400', imageHint: 'skin care', doctors: [] },
    { id: 'dept-05', name: 'Neurology', description: 'Nervous system disorders.', image: 'https://picsum.photos/seed/neuro/600/400', imageHint: 'brain model', doctors: [] },
];


export function AddDepartmentStep({ onDepartmentAdded }: { onDepartmentAdded: (department: Department) => void }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const { toast } = useToast();

  const handleSelectDepartment = (department: Department) => {
    setSelectedDepartment(department);
    onDepartmentAdded(department);
    toast({
        title: "Department Added",
        description: `${department.name} has been added to your clinic.`,
    });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      {!selectedDepartment ? (
        <>
          <h1 className="text-2xl font-bold mb-2">Select your initial department</h1>
          <p className="text-muted-foreground mb-6">
            Add a department to your clinic to begin using the application.
          </p>
          <Button size="lg" onClick={() => setIsDialogOpen(true)}>
            <PlusCircle className="mr-2 h-5 w-5" />
            Add Department
          </Button>
        </>
      ) : (
        <div className="w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Your Department</h2>
            <Card className="overflow-hidden">
                <CardContent className="p-0">
                    <div className="relative h-48 w-full">
                        <Image
                            src={selectedDepartment.image}
                            alt={selectedDepartment.name}
                            fill
                            objectFit="cover"
                            data-ai-hint={selectedDepartment.imageHint}
                        />
                    </div>
                    <div className="p-4">
                        <h3 className="text-lg font-semibold">{selectedDepartment.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {selectedDepartment.description}
                        </p>
                    </div>
                </CardContent>
                <CardFooter className="bg-muted/30 px-4 py-3 justify-center">
                     <p className="text-sm text-primary font-semibold">Department Added Successfully!</p>
                </CardFooter>
            </Card>
        </div>
      )}

      <SelectDepartmentDialog
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        departments={superAdminDepartments}
        onDepartmentSelect={handleSelectDepartment}
      />
    </div>
  );
}
