
"use client";

import React, { useState, useMemo } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Calendar } from "@/components/ui/calendar"
import type { Appointment, Doctor, TimeSlot } from "@/lib/types";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "@/lib/utils";
import { format, parse, getDay, setHours, setMinutes, isSameDay } from "date-fns";

const formSchema = z.object({
  patientName: z.string().min(2, { message: "Name must be at least 2 characters." }),
  gender: z.enum(["Male", "Female", "Other"]),
  phone: z.string().min(10, { message: "Phone number must be at least 10 digits." }),
  age: z.coerce.number().min(0, "Age cannot be negative."),
  doctor: z.string().min(1, { message: "Please select a doctor." }),
  date: z.date({
    required_error: "A date is required.",
  }),
  time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s(AM|PM)$/, "Invalid time format"),
  department: z.string().min(1, { message: "Please select a department." }),
  status: z.enum(["Confirmed", "Pending", "Cancelled"]),
  treatment: z.string().min(2, { message: "Treatment must be at least 2 characters." }),
  bookedVia: z.enum(["Online", "Phone", "Walk-in"]),
  place: z.string().min(2, { message: "Place must be at least 2 characters." }),
});

type AddAppointmentFormValues = z.infer<typeof formSchema>;
type AddAppointmentFormProps = {
  onSave: (appointment: Omit<Appointment, 'id' | 'tokenNumber' | 'date'> & { date: string }) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  doctors: Doctor[];
  appointments: Appointment[];
};

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function AddAppointmentForm({ onSave, isOpen, setIsOpen, doctors, appointments }: AddAppointmentFormProps) {
  
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  
  const form = useForm<AddAppointmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientName: "",
      gender: "Male",
      phone: "",
      age: 0,
      doctor: "",
      date: undefined,
      time: undefined,
      department: "",
      treatment: "",
      place: "",
      status: "Pending",
      bookedVia: "Online",
    },
  });

  function onSubmit(values: AddAppointmentFormValues) {
    const dataToSave = {
        ...values,
        date: format(values.date, "d MMMM yyyy"),
    };
    onSave(dataToSave);
    setIsOpen(false);
    form.reset();
    setSelectedDoctor(null);
  }

  const onDoctorChange = (doctorId: string) => {
    form.setValue("doctor", doctorId);
    const doctor = doctors.find(d => d.id === doctorId);
    if (doctor) {
        setSelectedDoctor(doctor);
        form.setValue("department", doctor.department || "");
        form.clearErrors("date");
        form.clearErrors("time");
    } else {
        setSelectedDoctor(null);
        form.setValue("department", "");
    }
  }

  const selectedDate = form.watch("date");

  const availableDaysOfWeek = useMemo(() => {
    if (!selectedDoctor?.availabilitySlots) return [];
    const dayNames = selectedDoctor.availabilitySlots.map(s => s.day);
    return daysOfWeek.reduce((acc, day, index) => {
        if (dayNames.includes(day)) {
            acc.push(index);
        }
        return acc;
    }, [] as number[]);
  }, [selectedDoctor]);
  
  const leaveDates = useMemo(() => {
      return (selectedDoctor?.leaveSlots || [])
          .filter(ls => ls.slots.length > 0)
          .map(ls => parse(ls.date, 'yyyy-MM-dd', new Date()));
  }, [selectedDoctor?.leaveSlots]);


  const timeSlots = useMemo(() => {
    if (!selectedDate || !selectedDoctor || !selectedDoctor.availabilitySlots || !selectedDoctor.averageConsultingTime) {
      return [];
    }

    const dayOfWeek = daysOfWeek[getDay(selectedDate)];
    const availabilityForDay = selectedDoctor.availabilitySlots.find(s => s.day === dayOfWeek);
    if (!availabilityForDay) return [];
    
    const formattedDate = format(selectedDate, "d MMMM yyyy");
    const bookedSlotsForDay = appointments
      .filter(apt => apt.doctor === selectedDoctor.name && apt.date === formattedDate)
      .map(apt => apt.time);

    const slots: { time: string; disabled: boolean }[] = [];
    const avgTime = selectedDoctor.averageConsultingTime;
    
    const leaveForDate = selectedDoctor.leaveSlots?.find(ls => isSameDay(parse(ls.date, 'yyyy-MM-dd', new Date()), selectedDate));
    const leaveTimeSlots = leaveForDate ? leaveForDate.slots : [];

    availabilityForDay.timeSlots.forEach(ts => {
      let currentTime = parse(ts.from, 'HH:mm', selectedDate);
      const endTime = parse(ts.to, 'HH:mm', selectedDate);

      while (currentTime < endTime) {
        const slotTime = format(currentTime, "hh:mm a");
        
        const isLeave = leaveTimeSlots.some(leaveSlot => {
           const leaveStart = parse(leaveSlot.from, 'HH:mm', selectedDate);
           const leaveEnd = parse(leaveSlot.to, 'HH:mm', selectedDate);
           return currentTime >= leaveStart && currentTime < leaveEnd;
        });

        if (!isLeave) {
            slots.push({
              time: slotTime,
              disabled: bookedSlotsForDay.includes(slotTime),
            });
        }

        currentTime.setMinutes(currentTime.getMinutes() + avgTime);
      }
    });

    return slots;
  }, [selectedDate, selectedDoctor, appointments]);


  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          form.reset();
          setSelectedDoctor(null);
        }
    }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Book New Appointment</DialogTitle>
          <DialogDescription>
            Fill in the details below to book a new appointment.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ScrollArea className="h-[70vh] p-1">
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {/* Patient Details Column */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium border-b pb-2">Patient Details</h3>
                   <FormField
                      control={form.control}
                      name="patientName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Patient Name</FormLabel>
                          <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="age"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age</FormLabel>
                          <FormControl><Input type="number" placeholder="35" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                            <FormLabel>Gender</FormLabel>
                            <FormControl>
                                <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex items-center space-x-4"
                                >
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl><RadioGroupItem value="Male" /></FormControl>
                                    <FormLabel className="font-normal">Male</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl><RadioGroupItem value="Female" /></FormControl>
                                    <FormLabel className="font-normal">Female</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl><RadioGroupItem value="Other" /></FormControl>
                                    <FormLabel className="font-normal">Other</FormLabel>
                                </FormItem>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl><Input placeholder="123-456-7890" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="place"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Place</FormLabel>
                          <FormControl><Input placeholder="e.g. New York, USA" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="treatment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Treatment</FormLabel>
                          <FormControl><Input placeholder="e.g. Routine Check-up" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="bookedVia"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Booked Via</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select booking channel" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="Online">Online</SelectItem>
                                    <SelectItem value="Phone">Phone</SelectItem>
                                    <SelectItem value="Walk-in">Walk-in</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                {/* Appointment/Doctor Details Column */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium border-b pb-2">Appointment Details</h3>
                  <FormField
                    control={form.control}
                    name="doctor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Doctor</FormLabel>
                        <Select onValueChange={onDoctorChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a doctor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {doctors.map(doc => (
                              <SelectItem key={doc.id} value={doc.id}>
                                {doc.name} - {doc.specialty}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   {selectedDoctor && (
                    <>
                     <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Select Date</FormLabel>
                              <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  disabled={(date) => 
                                    date < new Date(new Date().setHours(0,0,0,0)) || 
                                    !availableDaysOfWeek.includes(getDay(date)) ||
                                    leaveDates.some(leaveDate => isSameDay(date, leaveDate))
                                  }
                                  initialFocus
                                  className="rounded-md border"
                                  modifiers={{ 
                                      available: { dayOfWeek: availableDaysOfWeek },
                                      leave: leaveDates,
                                  }}
                                  modifiersStyles={{ 
                                      available: { backgroundColor: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))' },
                                      leave: { color: 'red', textDecoration: 'line-through' } 
                                  }}
                              />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {selectedDate && (
                         <FormField
                            control={form.control}
                            name="time"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Select Time Slot</FormLabel>
                                <div className="grid grid-cols-4 gap-2">
                                  {timeSlots.length > 0 ? timeSlots.map(slot => (
                                    <Button
                                      key={slot.time}
                                      type="button"
                                      variant={field.value === slot.time ? "default" : "outline"}
                                      onClick={() => field.onChange(slot.time)}
                                      disabled={slot.disabled}
                                      className={cn(slot.disabled && "line-through")}
                                    >
                                      {slot.time}
                                    </Button>
                                  )) : <p className="text-sm text-muted-foreground col-span-4">No available slots for this day.</p>}
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                      )}
                    </>
                   )}
                </div>
              </div>

            </ScrollArea>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit">Book Appointment</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
