
"use client";

import React, { useState, useTransition, useEffect } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Doctor } from "@/lib/types";
import { getAdjustedAvailability } from "@/app/actions";
import { Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

type DoctorAvailabilityState = {
  [key: string]: {
    adjustedSchedule?: string;
    error?: string;
  };
};

export default function DoctorAvailability() {
  const [isPending, startTransition] = useTransition();
  const [availability, setAvailability] = useState<DoctorAvailabilityState>({});
  const { toast } = useToast();
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

  const handleAnalysis = (doctor: Doctor) => {
    startTransition(async () => {
      const result = await getAdjustedAvailability({
        doctorId: doctor.id,
        currentSchedule: doctor.schedule,
        typicalAppointmentLengths: "Standard: 20 mins, New Patient: 40 mins, Follow-up: 15 mins",
        doctorPreferences: doctor.preferences,
        historicalSchedulingData: doctor.historicalData,
      });

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Analysis Failed",
          description: result.error,
        });
        setAvailability(prev => ({ ...prev, [doctor.id]: { error: result.error } }));
      } else if (result.adjustedAvailability) {
        setAvailability(prev => ({
          ...prev,
          [doctor.id]: { adjustedSchedule: result.adjustedAvailability },
        }));
      }
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Doctor Availability</CardTitle>
        <CardDescription>AI-powered schedule optimization.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow overflow-auto">
        <Accordion type="single" collapsible className="w-full">
          {doctors.map((doctor) => (
            <AccordionItem value={doctor.id} key={doctor.id}>
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <Image
                    src={doctor.avatar}
                    alt={doctor.name}
                    width={40}
                    height={40}
                    className="rounded-full"
                    data-ai-hint="doctor portrait"
                  />
                  <div>
                    <p className="font-semibold text-left">{doctor.name}</p>
                    <p className="text-sm text-muted-foreground text-left">{doctor.specialty}</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm">Current Schedule</h4>
                  <p className="text-sm text-muted-foreground">{doctor.schedule}</p>
                </div>
                {availability[doctor.id]?.adjustedSchedule && (
                  <div className="p-3 bg-accent/50 rounded-md border border-accent">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Wand2 className="w-4 h-4 text-primary" />
                        AI-Adjusted Availability
                    </h4>
                    <p className="text-sm text-accent-foreground">{availability[doctor.id].adjustedSchedule}</p>
                  </div>
                )}
                <Button
                  onClick={() => handleAnalysis(doctor)}
                  disabled={isPending}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  Analyze & Adjust
                </Button>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

    