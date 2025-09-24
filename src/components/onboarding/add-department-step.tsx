
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
    { id: 'dept-01', name: 'General Medicine', description: 'Comprehensive primary care.', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVkaWNpbmV8ZW58MHx8MHx8fDA%3D', doctors: [] },
    { id: 'dept-02', name: 'Cardiology', description: 'Specialized heart care.', image: 'https://images.unsplash.com/photo-1530026405182-271453396975?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MjZ8fG1lZGljaW5lfGVufDB8fDB8fHww', doctors: [] },
    { id: 'dept-03', name: 'Pediatrics', description: 'Healthcare for children.', image: 'https://images.unsplash.com/photo-1599586120429-48281b6f0ece?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTR8fGNoaWxkcmVuJTIwZG9jdG9yfGVufDB8fDB8fHww', doctors: [] },
    { id: 'dept-04', name: 'Dermatology', description: 'Skin health services.', image: 'https://images.unsplash.com/photo-1631894959934-396b3a8d11b3?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGRlcm1hdG9sb2d5fGVufDB8fDB8fHww', doctors: [] },
    { id: 'dept-05', name: 'Neurology', description: 'Nervous system disorders.', image: 'https://images.unsplash.com/photo-1695423589949-c9a56f626245?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Nnx8bmV1cm9sb2d5fGVufDB8fDB8fHww', doctors: [] },
];


export function AddDepartmentStep({ onDepartmentsAdded }: { onDepartmentsAdded: (departments: Department[]) => void }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState<Department[]>([]);
  const { toast } = useToast();

  const handleSelectDepartments = (departments: Department[]) => {
    setSelectedDepartments(departments);
    onDepartmentsAdded(departments);
    toast({
        title: "Departments Added",
        description: `${departments.length} departments have been added to your clinic.`,
    });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      {selectedDepartments.length === 0 ? (
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
            <h2 className="text-2xl font-bold mb-4">Your Departments</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedDepartments.map(department => (
                <Card key={department.id} className="overflow-hidden">
                    <CardContent className="p-0">
                        <div className="relative h-40 w-full">
                            <Image
                                src={department.image}
                                alt={department.name}
                                fill
                                style={{objectFit: "cover"}}
                                
                            />
                        </div>
                        <div className="p-4">
                            <h3 className="text-lg font-semibold">{department.name}</h3>
                            <p className="text-sm text-muted-foreground mt-1 h-10">
                                {department.description}
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="bg-muted/30 px-4 py-3 justify-center">
                        <p className="text-sm text-primary font-semibold">Added Successfully!</p>
                    </CardFooter>
                </Card>
            ))}
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

    