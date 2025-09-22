
"use client";

import { useState, useEffect, useTransition } from "react";
import { format, getDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { AvailabilitySlot, TimeSlot, LeaveSlot } from "@/lib/types";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type TimeSlotsProps = {
  selectedDate: Date | undefined;
  availabilitySlots: AvailabilitySlot[];
  leaveSlots: LeaveSlot[];
  onLeaveUpdate: (updatedLeave: LeaveSlot[]) => void;
  isPending: boolean;
};

export function TimeSlots({ selectedDate, availabilitySlots, leaveSlots, onLeaveUpdate, isPending }: TimeSlotsProps) {
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
      <div className="space-y-2 flex-grow">
        {daySlots && daySlots.timeSlots.length > 0 ? (
          daySlots.timeSlots.map((ts, i) => {
            const isMarked = markedAsLeave.some(s => s.from === ts.from && s.to === ts.to);
            return (
              <Badge
                key={i}
                variant={isMarked ? "danger" : "success"}
                className="text-sm cursor-pointer w-full justify-center"
                onClick={() => toggleSlot(ts)}
              >
                {ts.from} - {ts.to}
              </Badge>
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
