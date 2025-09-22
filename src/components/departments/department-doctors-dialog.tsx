
"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Department, Doctor } from "@/lib/types";
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

type DepartmentDoctorsDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  department: Department | null;
  allDoctors: Doctor[];
};

export function DepartmentDoctorsDialog({ isOpen, setIsOpen, department, allDoctors }: DepartmentDoctorsDialogProps) {
    const [departmentDoctors, setDepartmentDoctors] = useState<Doctor[]>([]);

    useEffect(() => {
        if (department && allDoctors.length > 0) {
            const doctorsOfDept = allDoctors.filter(doctor => department.doctors.includes(doctor.name));
            setDepartmentDoctors(doctorsOfDept);
        }
    }, [department, allDoctors]);
    

  if (!department) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{department.name} Doctors</DialogTitle>
          <DialogDescription>
            Doctors available in the {department.name} department.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72">
          <div className="space-y-4 pr-4">
            {departmentDoctors.length > 0 ? (
                departmentDoctors.map(doctor => (
                <div key={doctor.id} className="flex items-center gap-4 p-2 rounded-lg hover:bg-muted/50">
                    <Avatar>
                        <AvatarImage src={doctor.avatar} alt={doctor.name} data-ai-hint="doctor portrait"/>
                        <AvatarFallback>{doctor.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-grow">
                        <p className="font-semibold text-sm">{doctor.name}</p>
                        <p className="text-xs text-muted-foreground">{doctor.specialty}</p>
                    </div>
                </div>
            ))
            ) : (
                <p className="text-center text-sm text-muted-foreground py-8">
                    No doctors found for this department.
                </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
