
"use client";

import { useState, useEffect } from "react";
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
import { PlusCircle, Trash, Copy, Upload } from "lucide-react";
import type { Doctor, Department } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "../ui/scroll-area";
import Image from "next/image";
import { Textarea } from "../ui/textarea";

const timeSlotSchema = z.object({
  from: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  to: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
});

const availabilitySlotSchema = z.object({
  day: z.string(),
  timeSlots: z.array(timeSlotSchema).min(1, "At least one time slot is required."),
});

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  specialty: z.string().min(2, { message: "Specialty must be at least 2 characters." }),
  department: z.string().min(1, { message: "Please select a department." }),
  bio: z.string().min(10, { message: "Bio must be at least 10 characters." }),
  averageConsultingTime: z.coerce.number().min(5, "Must be at least 5 minutes."),
  availableDays: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one day.",
  }),
  availabilitySlots: z.array(availabilitySlotSchema),
  photo: z.instanceof(File).optional(),
});

type AddDoctorFormValues = z.infer<typeof formSchema>;

type AddDoctorFormProps = {
  onSave: (doctor: AddDoctorFormValues) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  doctor: Doctor | null;
  departments: Department[];
};

const daysOfWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const generateTimeOptions = () => {
    const options = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            const hour = String(h).padStart(2, '0');
            const minute = String(m).padStart(2, '0');
            options.push(`${hour}:${minute}`);
        }
    }
    return options;
};
const timeOptions = generateTimeOptions();

export function AddDoctorForm({ onSave, isOpen, setIsOpen, doctor, departments }: AddDoctorFormProps) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const { toast } = useToast();
  const isEditMode = !!doctor;

  const form = useForm<AddDoctorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      specialty: "",
      department: "",
      bio: "",
      averageConsultingTime: 15,
      availableDays: [],
      availabilitySlots: [],
    },
  });

  useEffect(() => {
    if (doctor) {
      form.reset({
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
        department: doctor.department,
        bio: doctor.bio || "",
        averageConsultingTime: doctor.averageConsultingTime || 15,
        availableDays: doctor.availabilitySlots?.map(s => s.day) || [],
        availabilitySlots: doctor.availabilitySlots || [],
      });
      setPhotoPreview(doctor.avatar);
    } else {
      form.reset({
        name: "",
        specialty: "",
        department: "",
        bio: "",
        averageConsultingTime: 15,
        availableDays: [],
        availabilitySlots: [],
      });
      setPhotoPreview(null);
    }
  }, [doctor, form]);


  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "availabilitySlots",
  });

  const watchedAvailableDays = form.watch("availableDays");

  const copyTimeSlotToAllDays = (dayIndex: number, timeIndex: number) => {
    const timeSlotToCopy = form.getValues(`availabilitySlots.${dayIndex}.timeSlots.${timeIndex}`);
    if (!timeSlotToCopy.from || !timeSlotToCopy.to) {
        toast({
            variant: "destructive",
            title: "Cannot Copy",
            description: "Please fill in both 'From' and 'To' times before copying.",
        });
        return;
    }

    const currentSlots = form.getValues('availabilitySlots');
    const updatedSlots = currentSlots.map(daySlot => {
        if (watchedAvailableDays.includes(daySlot.day)) {
            const timeSlotExists = daySlot.timeSlots.some(ts => ts.from === timeSlotToCopy.from && ts.to === timeSlotToCopy.to);
            if (!timeSlotExists) {
                return { ...daySlot, timeSlots: [...daySlot.timeSlots, timeSlotToCopy] };
            }
        }
        return daySlot;
    });

    form.setValue('availabilitySlots', updatedSlots, { shouldDirty: true });

    toast({
      title: "Time Slot Copied",
      description: `Time slot ${timeSlotToCopy.from} - ${timeSlotToCopy.to} has been applied to all selected days.`,
    });
  }

  function onSubmit(values: AddDoctorFormValues) {
    onSave(values);
    setIsOpen(false);
    form.reset();
    setPhotoPreview(null);
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      form.setValue('photo', file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
            form.reset();
            setPhotoPreview(null);
        }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Doctor" : "Add New Doctor"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update the details for this doctor." : "Fill in the details below to add a new doctor to the system."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ScrollArea className="h-[60vh] p-4">
              <div className="space-y-4">
                 <FormField
                  control={form.control}
                  name="photo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Doctor's Photo</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                            {photoPreview ? (
                              <Image src={photoPreview} alt="Doctor's Photo" width={96} height={96} className="object-cover" />
                            ) : (
                              <Upload className="w-8 h-8 text-muted-foreground" />
                            )}
                          </div>
                          <Input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" id="photo-upload" />
                          <label htmlFor="photo-upload" className="cursor-pointer">
                            <Button type="button" variant="outline">
                              <Upload className="mr-2 h-4 w-4" />
                              Upload
                            </Button>
                          </label>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
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
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea placeholder="A brief biography of the doctor..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="averageConsultingTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Average Consulting Time (minutes)</FormLabel>
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
                                        const currentDays = field.value || [];
                                        const newDays = checked
                                          ? [...currentDays, day]
                                          : currentDays.filter(
                                              (value) => value !== day
                                            );
                                        field.onChange(newDays);

                                        const dayIndex = fields.findIndex(f => f.day === day);
                                        if (checked && dayIndex === -1) {
                                          append({ day: day, timeSlots: [{ from: "09:00", to: "10:00" }] });
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
                                        name={`availabilitySlots.${dayIndex}.timeSlots.${timeIndex}.from`}
                                        render={({ field }) => (
                                            <FormItem className="flex-grow">
                                                <FormLabel className="text-xs">From</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="HH:MM" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {timeOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name={`availabilitySlots.${dayIndex}.timeSlots.${timeIndex}.to`}
                                        render={({ field }) => (
                                            <FormItem className="flex-grow">
                                                <FormLabel className="text-xs">To</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="HH:MM" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {timeOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="button" variant="ghost" size="icon" onClick={() => copyTimeSlotToAllDays(dayIndex, timeIndex)} className="self-end">
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    <Button type="button" variant="outline" size="icon" className="self-end" onClick={() => {
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
                                const newSlots = [...currentSlots, { from: "", to: "" }];
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
              <Button type="submit">{isEditMode ? "Save Changes" : "Save Doctor"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
