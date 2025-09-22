

"use client";

import { useState, useEffect, useMemo } from "react";
import { format, getDay, isSameDay, parse as parseDateFns } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { AvailabilitySlot, TimeSlot, LeaveSlot, Appointment } from "@/lib/types";
import { Button } from "../ui/button";
import { Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type TimeSlotsProps = {
  selectedDate: Date | undefined;
  availabilitySlots: AvailabilitySlot[];
  leaveSlots: LeaveSlot[];
  appointments: Appointment[];
  onLeaveUpdate: (updatedLeave: LeaveSlot[]) => void;
  isPending: boolean;
};

export function TimeSlots({ selectedDate, availabilitySlots, leaveSlots, appointments, onLeaveUpdate, isPending }: TimeSlotsProps) {
  const [markedAsLeave, setMarkedAsLeave] = useState<TimeSlot[]>([]);

  useEffect(() => {
    if (selectedDate) {
        const dateString = format(selectedDate, "yyyy-MM-dd");
        const existingLeaveForDate = leaveSlots.find(ls => ls.date === dateString);
        setMarkedAsLeave(existingLeaveForDate ? existingLeaveForDate.slots : []);
    } else {
        setMarkedAsLeave([]);
    }
  }, [selectedDate, leaveSlots]);

  if (!selectedDate) {
    return (
      <div className="p-4 border rounded-md h-full flex items-center justify-center text-muted-foreground">
        Select a date to see time slots.
      </div>
    );
  }

  const dayOfWeek = daysOfWeek[getDay(selectedDate)];
  const daySlots = availabilitySlots.find(slot => slot.day === dayOfWeek);

  const getAppointmentsForSlot = (slot: TimeSlot) => {
    if (!selectedDate) return 0;
    const formattedDate = format(selectedDate, 'd MMMM yyyy');
    const slotStart = parseDateFns(slot.from, 'HH:mm', selectedDate);

    return appointments.filter(apt => {
        if (apt.date !== formattedDate) return false;
        try {
            const aptTime = parseDateFns(apt.time, 'hh:mm a', selectedDate);
            return aptTime.getTime() === slotStart.getTime();
        } catch (e) {
            console.error("Error parsing appointment time", apt.time, e);
            return false;
        }
    }).length;
  }

  const toggleSlot = (slotToToggle: TimeSlot) => {
    setMarkedAsLeave(prev => {
        const isMarked = prev.some(s => s.from === slotToToggle.from && s.to === slotToToggle.to);
        if (isMarked) {
            return prev.filter(s => !(s.from === slotToToggle.from && s.to === slotToToggle.to));
        } else {
            return [...prev, slotToToggle];
        }
    });
  };
  
  const handleSave = () => {
    if (!selectedDate) return;
    const dateString = format(selectedDate, "yyyy-MM-dd");
    
    // Create a copy of existing leave slots, excluding the current date
    const otherLeaveSlots = leaveSlots.filter(ls => ls.date !== dateString);

    let updatedLeaveSlots;
    if (markedAsLeave.length > 0) {
        // If there are slots marked as leave for the current date, add/update it
        updatedLeaveSlots = [...otherLeaveSlots, { date: dateString, slots: markedAsLeave }];
    } else {
        // If no slots are marked as leave, we are just removing any existing leave for this date
        updatedLeaveSlots = otherLeaveSlots;
    }
    
    onLeaveUpdate(updatedLeaveSlots);
  }


  return (
    <div className="p-4 border rounded-md h-full flex flex-col">
      <h3 className="font-semibold mb-2">
        Available Slots for {format(selectedDate, "MMMM d, yyyy")}
      </h3>
      <div className="space-y-2 flex-grow overflow-y-auto">
        {daySlots && daySlots.timeSlots.length > 0 ? (
          daySlots.timeSlots.map((ts, i) => {
            const isMarked = markedAsLeave.some(s => s.from === ts.from && s.to === ts.to);
            const appointmentCount = getAppointmentsForSlot(ts);
            return (
              <Button
                key={i}
                variant={isMarked ? "destructive" : "outline"}
                className="text-sm cursor-pointer w-full justify-between h-auto"
                onClick={() => toggleSlot(ts)}
              >
                <span>{ts.from} - {ts.to}</span>
                {appointmentCount > 0 && (
                    <Badge variant="secondary" className={cn("text-foreground", isMarked && "bg-white/20 text-white")}>
                        <Users className="w-3 h-3 mr-1" />
                        {appointmentCount}
                    </Badge>
                )}
              </Button>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground text-center pt-4">
            No available slots for {dayOfWeek}.
          </p>
        )}
      </div>
      <Button onClick={handleSave} disabled={isPending} className="mt-4 w-full">
        {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : 'Save Leave'}
      </Button>
    </div>
  );
}

