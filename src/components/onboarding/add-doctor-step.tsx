
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
import { Users, CalendarDays, Edit, Trash, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";


export function AddDoctorStep({ department, onDoctorAdded }: { department: Department, onDoctorAdded: (doctor: Doctor) => void }) {
  const [isAddDoctorOpen, setIsAddDoctorOpen] = useState(false);
  const [addedDoctor, setAddedDoctor] = useState<Doctor | null>(null);
  const { toast } = useToast();

  const handleSaveDoctor = (doctorData: Omit<Doctor, 'id' | 'avatar' | 'schedule' | 'preferences' | 'historicalData'> & { photo?: File; id?: string }) => {
    const newDoctor: Doctor = {
      id: `doc-${new Date().getTime()}`,
      name: doctorData.name,
      specialty: doctorData.specialty,
      avatar: doctorData.photo ? URL.createObjectURL(doctorData.photo) : `https://picsum.photos/seed/new-doc-${new Date().getTime()}/100/100`,
      schedule: 'Mon-Fri: 9 AM - 5 PM',
      preferences: 'Not set',
      historicalData: 'No data',
      department: doctorData.department,
      totalPatients: doctorData.totalPatients,
      todaysAppointments: doctorData.todaysAppointments,
      availability: doctorData.availability,
      maxPatientsPerDay: doctorData.maxPatientsPerDay,
      availabilitySlots: doctorData.availabilitySlots,
    };
    setAddedDoctor(newDoctor);
    onDoctorAdded(newDoctor);

    toast({
      title: "First Doctor Added!",
      description: `${doctorData.name} has been added. You can now proceed.`,
    });
    setIsAddDoctorOpen(false);
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
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Total Patients</p>
                            <p className="text-sm">{addedDoctor.totalPatients}</p>
                        </div>
                        <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Today</p>
                            <p className="text-sm">{addedDoctor.todaysAppointments}</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Badge
                        variant={addedDoctor.availability === "Available" ? "success" : "danger"}
                        className="w-full justify-center"
                    >
                        {addedDoctor.availability}
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
      />
    </div>
  );
}
