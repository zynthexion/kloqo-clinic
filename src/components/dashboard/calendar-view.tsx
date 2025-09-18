"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import useLocalStorage from "@/hooks/use-local-storage";
import type { Appointment } from "@/lib/types";
import { useState, useEffect } from "react";

export default function CalendarView() {
  const [appointments] = useLocalStorage<Appointment[]>("appointments", []);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [appointmentDates, setAppointmentDates] = useState<Date[]>([]);

  useEffect(() => {
    const dates = appointments.map(apt => new Date(apt.date));
    setAppointmentDates(dates);
  }, [appointments]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Calendar</CardTitle>
        <CardDescription>Your upcoming appointments.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex items-center justify-center">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="rounded-md"
          modifiers={{
            scheduled: appointmentDates,
          }}
          modifiersStyles={{
            scheduled: { 
                border: "2px solid",
                borderColor: "hsl(var(--primary))",
                borderRadius: '9999px',
            },
            today: {
                backgroundColor: "hsl(var(--accent))",
                color: "hsl(var(--accent-foreground))",
                borderRadius: '9999px',
            }
          }}
        />
      </CardContent>
    </Card>
  );
}
