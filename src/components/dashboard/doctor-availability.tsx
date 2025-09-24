
"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Doctor } from "@/lib/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ScrollArea } from "../ui/scroll-area";
import { getDay, format } from "date-fns";
import { Button } from "../ui/button";
import Link from "next/link";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DoctorAvailabilityProps = {
  selectedDate: Date;
};

export default function DoctorAvailability({ selectedDate }: DoctorAvailabilityProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  useEffect(() => {
    const fetchDoctors = async () => {
      const doctorsCollection = collection(db, "doctors");
      const doctorsSnapshot = await getDocs(doctorsCollection);
      const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
      setDoctors(doctorsList);
    };
    fetchDoctors();
  }, []);

  const availableDoctors = useMemo(() => {
    if (!selectedDate) return [];
    const dayName = daysOfWeek[getDay(selectedDate)];
    return doctors.filter(doctor =>
      doctor.availabilitySlots?.some(slot => slot.day === dayName)
    );
  }, [selectedDate, doctors]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Available Doctors</CardTitle>
        <CardDescription>
          Doctors scheduled for {format(selectedDate, "MMMM d, yyyy")}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto">
        <ScrollArea className="h-full">
            <div className="space-y-4">
            {availableDoctors.length > 0 ? (
                availableDoctors.map((doctor) => (
                    <div key={doctor.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                        <Image
                            src={doctor.avatar}
                            alt={doctor.name}
                            width={40}
                            height={40}
                            className="rounded-full"
                            data-ai-hint="doctor portrait"
                        />
                        <div className="flex-grow">
                            <p className="font-semibold text-sm">{doctor.name}</p>
                            <p className="text-xs text-muted-foreground">{doctor.specialty}</p>
                        </div>
                        <div className="flex gap-2">
                           <Button asChild variant="outline" size="sm">
                               <Link href={`/doctors/${doctor.id}`}>View Profile</Link>
                           </Button>
                           <Button asChild variant="default" size="sm">
                                <Link href="/appointments">Book Appt.</Link>
                           </Button>
                        </div>
                    </div>
                ))
            ) : (
                <div className="flex items-center justify-center h-full pt-10">
                    <p className="text-sm text-muted-foreground text-center">No doctors scheduled for this day.</p>
                </div>
            )}
            </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
