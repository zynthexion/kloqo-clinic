
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Doctor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import { addDays, format, getDay } from "date-fns";
import Image from "next/image";
import { ScrollArea } from "../ui/scroll-area";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function WeeklyDoctorAvailability() {
  const [isOpen, setIsOpen] = useState(false);
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

  const weeklySchedule = useMemo(() => {
    const schedule = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const dayName = daysOfWeek[getDay(date)];
      const availableDoctors = doctors.filter(doctor => 
        doctor.availabilitySlots?.some(slot => slot.day === dayName)
      );
      schedule.push({
        date,
        dayName,
        doctors: availableDoctors,
      });
    }
    return schedule;
  }, [doctors]);

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl">
      <div className="relative flex flex-col items-center">
        {/* Collapsed Button */}
        <div className={cn("transition-all duration-300", isOpen && "translate-y-full opacity-0")}>
            <Button 
                className="relative h-16 w-16 rounded-full shadow-lg animate-wave"
                size="icon" 
                onClick={() => setIsOpen(true)}
            >
                <CalendarDays className="h-8 w-8" />
            </Button>
        </div>

        {/* Expanded Content */}
        <div className={cn(
            "absolute bottom-0 w-full transition-all duration-500 ease-in-out",
            isOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        )}>
          <Card className="rounded-t-2xl rounded-b-none border-b-0 shadow-2xl">
            <CardContent className="p-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsOpen(false)}
                className="w-full text-muted-foreground"
              >
                <ChevronDown className="h-5 w-5" />
              </Button>
              <div className="grid grid-cols-7 gap-2 mt-2">
                {weeklySchedule.map((day, index) => (
                  <div key={index} className="bg-muted/50 p-2 rounded-lg">
                    <p className="text-center font-bold text-sm">{format(day.date, "EEE")}</p>
                    <p className="text-center text-xs text-muted-foreground mb-2">{format(day.date, "d")}</p>
                    <ScrollArea className="h-32">
                        <div className="space-y-2">
                            {day.doctors.map(doctor => (
                                <div key={doctor.id} className="flex items-center gap-2 p-1 bg-background rounded-md">
                                    <Image 
                                        src={doctor.avatar} 
                                        alt={doctor.name}
                                        width={24}
                                        height={24}
                                        className="rounded-full"
                                        data-ai-hint="doctor portrait"
                                    />
                                    <p className="text-xs font-medium truncate">{doctor.name}</p>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
