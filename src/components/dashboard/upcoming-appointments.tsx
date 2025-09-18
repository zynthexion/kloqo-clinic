"use client";

import Image from "next/image";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Appointment } from "@/lib/types";
import { format } from "date-fns";
import { doctors } from "@/lib/data";

const initialAppointments: Appointment[] = [];


export default function UpcomingAppointments() {
  const [appointments] = React.useState<Appointment[]>(initialAppointments);
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  const upcomingAppointments = React.useMemo(() => {
    const now = new Date().getTime();
    // Sort appointments by date and time
    const sortedAppointments = [...appointments].sort((a, b) => {
      const dateA = new Date(a.date).setHours(parseInt(a.time.split(':')[0]), parseInt(a.time.split(':')[1]));
      const dateB = new Date(b.date).setHours(parseInt(b.time.split(':')[0]), parseInt(b.time.split(':')[1]));
      return dateA - dateB;
    });

    return sortedAppointments.filter(apt => {
      const aptDateTime = new Date(apt.date).setHours(parseInt(apt.time.split(':')[0]), parseInt(apt.time.split(':')[1]));
      return aptDateTime >= now;
    }).slice(0, 5);
  }, [appointments]);


  const getDoctorAvatar = (doctorName: string) => {
    const doctor = doctors.find(d => d.name === doctorName);
    return doctor ? doctor.avatar : "https://picsum.photos/seed/placeholder/100/100";
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Upcoming Appointments</CardTitle>
        <CardDescription>Your next 5 scheduled appointments.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden">
        <ScrollArea className="h-full">
            <div className="space-y-4">
            {isClient && (upcomingAppointments.length > 0 ? upcomingAppointments.map((apt) => (
                <div key={apt.id} className="flex items-center gap-4 p-2 rounded-lg hover:bg-muted/50">
                    <Image
                        src={getDoctorAvatar(apt.doctor)}
                        alt={apt.doctor}
                        width={40}
                        height={40}
                        className="rounded-full"
                        data-ai-hint="doctor portrait"
                    />
                    <div className="flex-grow">
                        <p className="font-semibold text-sm">{apt.patientName}</p>
                        <p className="text-xs text-muted-foreground">with {apt.doctor}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium">{apt.time}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(apt.date), "MMM d")}</p>
                    </div>
                </div>
            )) : (
                <p className="text-sm text-muted-foreground text-center py-8">No upcoming appointments.</p>
            ))}
            </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
