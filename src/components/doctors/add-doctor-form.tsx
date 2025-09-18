
"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle, Trash } from "lucide-react";
import { departments } from "@/lib/data";
import type { Doctor, AvailabilitySlot } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "../ui/scroll-area";

const timeSlotSchema = z.object({
  time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
});

const availabilitySlotSchema = z.object({
  day: z.string(),
  timeSlots: z.array(timeSlotSchema).min(1, "At least one time slot is required."),
});

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  specialty: z.string().min(2, { message: "Specialty must be at least 2 characters." }),
  department: z.string().min(1, { message: "Please select a department." }),
  availability: z.enum(["Available", "Unavailable"]),
  maxPatientsPerDay: z.coerce.number().min(1, "Must be at least 1."),
  availableDays: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one day.",
  }),
  availabilitySlots: z.array(availabilitySlotSchema),
});

type AddDoctorFormValues = z.infer<typeof formSchema>;

type AddDoctorFormProps = {
  onAddDoctor: (doctor: Omit<Doctor, 'id' | 'avatar' | 'schedule' | 'preferences' | 'historicalData' | 'totalPatients' | 'todaysAppointments'> & { maxPatientsPerDay: number; availabilitySlots: AvailabilitySlot[] }) => void;
};

const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function AddDoctorForm({ onAddDoctor }: AddDoctorFormProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<AddDoctorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      specialty: "",
      department: "",
      availability: "Available",
      maxPatientsPerDay: 10,
      availableDays: [],
      availabilitySlots: [],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "availabilitySlots",
  });

  const watchedAvailableDays = form.watch("availableDays");

  function onSubmit(values: AddDoctorFormValues) {
    const { availableDays, ...rest } = values;
    const scheduleString = values.availabilitySlots.map(slot => `${slot.day}: ${slot.timeSlots.map(ts => ts.time).join(', ')}`).join('; ');
    
    onAddDoctor({
        ...rest,
        availabilitySlots: values.availabilitySlots,
        schedule: scheduleString
    });

    toast({
      title: "Doctor Added",
      description: `${values.name} has been successfully added.`,
    });
    setOpen(false);
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Doctor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Doctor</DialogTitle>
          <DialogDescription>
            Fill in the details below to add a new doctor to the system.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ScrollArea className="h-[60vh] p-4">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Dr. John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="specialty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specialty</FormLabel>
                      <FormControl>
                        <Input placeholder="Cardiology" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a department" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.map(dept => (
                            <SelectItem key={dept.id} value={dept.name}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="availability"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Availability</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select availability" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Available">Available</SelectItem>
                          <SelectItem value="Unavailable">Unavailable</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxPatientsPerDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum Patients Per Day</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="availableDays"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel>Available Days</FormLabel>
                        <FormDescription>
                          Select the days the doctor is available.
                        </FormDescription>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {daysOfWeek.map((day) => (
                          <FormField
                            key={day}
                            control={form.control}
                            name="availableDays"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={day}
                                  className="flex flex-row items-start space-x-3 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(day)}
                                      onCheckedChange={(checked) => {
                                        const newDays = checked
                                          ? [...field.value, day]
                                          : field.value?.filter(
                                              (value) => value !== day
                                            );
                                        field.onChange(newDays);

                                        const dayIndex = fields.findIndex(f => f.day === day);
                                        if (checked && dayIndex === -1) {
                                          append({ day: day, timeSlots: [{ time: "09:00" }] });
                                        } else if (!checked && dayIndex > -1) {
                                          remove(dayIndex);
                                        }
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-normal">
                                    {day}
                                  </FormLabel>
                                </FormItem>
                              );
                            }}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {fields.map((field, dayIndex) => {
                    const timeSlotsArray = form.getValues(`availabilitySlots.${dayIndex}.timeSlots`);
                    
                    return (
                        <div key={field.id} className="space-y-2 p-3 border rounded-md">
                            <h4 className="font-semibold">{field.day} Time Slots</h4>
                            {timeSlotsArray.map((_, timeIndex) => (
                                <div key={timeIndex} className="flex items-center gap-2">
                                    <FormField
                                        control={form.control}
                                        name={`availabilitySlots.${dayIndex}.timeSlots.${timeIndex}.time`}
                                        render={({ field }) => (
                                            <FormItem className="flex-grow">
                                                <FormControl>
                                                    <Input {...field} placeholder="HH:MM" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="button" variant="outline" size="icon" onClick={() => {
                                        const currentSlots = form.getValues(`availabilitySlots.${dayIndex}.timeSlots`);
                                        const newSlots = currentSlots.filter((_, i) => i !== timeIndex);
                                        update(dayIndex, { ...form.getValues(`availabilitySlots.${dayIndex}`), timeSlots: newSlots });
                                    }}>
                                        <Trash className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button type="button" size="sm" variant="outline" onClick={() => {
                                const currentSlots = form.getValues(`availabilitySlots.${dayIndex}.timeSlots`);
                                const newSlots = [...currentSlots, { time: "" }];
                                update(dayIndex, { ...form.getValues(`availabilitySlots.${dayIndex}`), timeSlots: newSlots });
                            }}>
                                Add Time Slot
                            </Button>
                        </div>
                    )
                })}


              </div>
            </ScrollArea>
            <DialogFooter>
              <Button type="submit">Save Doctor</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
