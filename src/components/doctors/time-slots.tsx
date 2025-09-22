
"use client";

import { useState, useEffect } from "react";
import { format, getDay, isSameDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { AvailabilitySlot } from "@/lib/types";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type TimeSlotsProps = {
  selectedDate: Date | undefined;
  availabilitySlots: AvailabilitySlot[];
};

export function TimeSlots({ selectedDate, availabilitySlots }: TimeSlotsProps) {
  const [disabledSlots, setDisabledSlots] = useState<string[]>([]);

  useEffect(() => {
    // Reset disabled slots when the date changes
    setDisabledSlots([]);
  }, [selectedDate]);

  if (!selectedDate) {
    return (
      <div className="p-4 border rounded-md h-full flex items-center justify-center text-muted-foreground">
        Select a date to see time slots.
      </div>
    );
  }

  const dayOfWeek = daysOfWeek[getDay(selectedDate)];
  const daySlots = availabilitySlots.find(slot => slot.day === dayOfWeek);

  const toggleSlot = (slotIdentifier: string) => {
    setDisabledSlots(prev => 
      prev.includes(slotIdentifier) 
        ? prev.filter(s => s !== slotIdentifier)
        : [...prev, slotIdentifier]
    );
  };

  return (
    <div className="p-4 border rounded-md h-full">
      <h3 className="font-semibold mb-2">
        Available Slots for {format(selectedDate, "MMMM d, yyyy")}
      </h3>
      <div className="space-y-2">
        {daySlots && daySlots.timeSlots.length > 0 ? (
          daySlots.timeSlots.map((ts, i) => {
            const slotIdentifier = `${ts.from}-${ts.to}`;
            const isDisabled = disabledSlots.includes(slotIdentifier);
            return (
              <Badge
                key={i}
                variant={isDisabled ? "danger" : "success"}
                className="text-sm cursor-pointer w-full justify-center"
                onClick={() => toggleSlot(slotIdentifier)}
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
    </div>
  );
}
