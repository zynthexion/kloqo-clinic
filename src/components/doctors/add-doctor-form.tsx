
"use client";

import { useState, useEffect } from "react";
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
import { PlusCircle, Trash, Upload } from "lucide-react";
import type { Doctor, Department, AvailabilitySlot } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "../ui/scroll-area";
import Image from "next/image";
import { Textarea } from "../ui/textarea";
import { format, parse } from "date-fns";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const timeSlotSchema = z.object({
  from: z.string().min(1, "Required"),
  to: z.string().min(1, "Required"),
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
  registrationNumber: z.string().optional(),
  bio: z.string().min(10, { message: "Bio must be at least 10 characters." }),
  experience: z.coerce.number().min(0, "Years of experience cannot be negative."),
  consultationFee: z.coerce.number().min(0, "Consultation fee cannot be negative."),
  averageConsultingTime: z.coerce.number().min(5, "Must be at least 5 minutes."),
  availabilitySlots: z.array(availabilitySlotSchema).min(1, "At least one availability slot is required."),
  photo: z.any().optional(),
  freeFollowUpDays: z.coerce.number().min(0, "Cannot be negative.").optional(),
  advanceBookingDays: z.coerce.number().min(0, "Cannot be negative.").optional(),
});

type AddDoctorFormValues = z.infer<typeof formSchema>;

type AddDoctorFormProps = {
  onSave: (doctor: AddDoctorFormValues & { consultationStatus?: 'In' | 'Out' }) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  doctor: Doctor | null;
  departments: Department[];
};

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayAbbreviations = ["S", "M", "T", "W", "T", "F", "S"];

export function AddDoctorForm({ onSave, isOpen, setIsOpen, doctor, departments }: AddDoctorFormProps) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const { toast } = useToast();
  const isEditMode = !!doctor;

  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [sharedTimeSlots, setSharedTimeSlots] = useState<Array<{ from: string; to: string }>>([{ from: "09:00", to: "17:00" }]);

  const form = useForm<AddDoctorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      specialty: "",
      department: "",
      registrationNumber: "",
      bio: "",
      experience: 0,
      consultationFee: 0,
      averageConsultingTime: 15,
      availabilitySlots: [],
      freeFollowUpDays: 7,
      advanceBookingDays: 30,
    },
  });

  useEffect(() => {
    if (doctor) {
      const availabilitySlots = doctor.availabilitySlots?.map(s => ({
          ...s,
          timeSlots: s.timeSlots.map(ts => {
            try {
              return {
                from: format(parse(ts.from, 'hh:mm a', new Date()), 'HH:mm'),
                to: format(parse(ts.to, 'hh:mm a', new Date()), 'HH:mm')
              }
            } catch {
                return { from: ts.from, to: ts.to };
            }
          })
        })) || [];
      form.reset({
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
        department: doctor.department,
        registrationNumber: doctor.registrationNumber || "",
        bio: doctor.bio || "",
        experience: doctor.experience || 0,
        consultationFee: doctor.consultationFee || 0,
        averageConsultingTime: doctor.averageConsultingTime || 15,
        availabilitySlots: availabilitySlots,
        freeFollowUpDays: doctor.freeFollowUpDays || 7,
        advanceBookingDays: doctor.advanceBookingDays || 30,
      });
      setPhotoPreview(doctor.avatar);
      if(availabilitySlots.length > 0) {
        setSharedTimeSlots(availabilitySlots[0].timeSlots);
      }
    } else {
      form.reset({
        name: "",
        specialty: "",
        department: "",
        registrationNumber: "",
        bio: "",
        experience: 0,
        consultationFee: 0,
        averageConsultingTime: 15,
        availabilitySlots: [],
        freeFollowUpDays: 7,
        advanceBookingDays: 30,
      });
      setPhotoPreview(null);
      setSharedTimeSlots([{ from: "09:00", to: "17:00" }]);
    }
  }, [doctor, form, isOpen]);

  const watchedAvailabilitySlots = form.watch('availabilitySlots');

  const applySharedSlotsToSelectedDays = () => {
    if (selectedDays.length === 0) {
        toast({
            variant: "destructive",
            title: "No days selected",
            description: "Please select one or more days to apply the time slots.",
        });
        return;
    }

    const validSharedTimeSlots = sharedTimeSlots.filter(ts => ts.from && ts.to);

    if (validSharedTimeSlots.length === 0) {
         toast({
            variant: "destructive",
            title: "No time slots defined",
            description: "Please define at least one valid time slot.",
        });
        return;
    }

    const currentFormSlots = form.getValues('availabilitySlots') || [];
    const newSlotsMap = new Map<string, AvailabilitySlot>();
    
    currentFormSlots.forEach(slot => newSlotsMap.set(slot.day, slot));

    selectedDays.forEach(day => {
        newSlotsMap.set(day, { day, timeSlots: validSharedTimeSlots });
    });

    const updatedSlots = Array.from(newSlotsMap.values());
    
    form.setValue('availabilitySlots', updatedSlots, { shouldDirty: true });
    
    toast({
        title: "Time Slots Applied",
        description: `The defined time slots have been applied to the selected days.`,
    });
    
    setSelectedDays([]);
};

  function onSubmit(values: AddDoctorFormValues) {
    onSave({ ...values, consultationStatus: isEditMode ? doctor.consultationStatus : "Out" });
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Doctor" : "Add New Doctor"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update the details for this doctor." : "Fill in the details below to add a new doctor to the system."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <ScrollArea className="h-[60vh] p-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                {/* Left Column */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="photo"
                    render={() => (
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
                          <Input placeholder="Dr. John Doe" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="registrationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., IMA/12345" {...field} />
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
                    name="experience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Years of Experience</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" placeholder="e.g., 10" {...field} value={field.value !== undefined ? field.value : ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="consultationFee"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Consultation Fee (₹)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" placeholder="e.g., 150" {...field} value={field.value !== undefined ? field.value : ''} />
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
                          <Input type="number" min="5" placeholder="e.g., 15" {...field} value={field.value !== undefined ? field.value : ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="freeFollowUpDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Free Follow-up Period (Days)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" placeholder="e.g., 7" {...field} value={field.value !== undefined ? field.value : ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="advanceBookingDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Advance Booking (Days)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" placeholder="e.g., 30" {...field} value={field.value !== undefined ? field.value : ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="availabilitySlots"
                    render={() => (
                      <FormItem>
                        <div className="mb-4">
                          <FormLabel className="text-base">Weekly Availability</FormLabel>
                          <FormDescription>
                            Define the doctor's recurring weekly schedule.
                          </FormDescription>
                        </div>
                          <div className="space-y-2">
                            <Label>1. Select days to apply time slots to</Label>
                            <ToggleGroup type="multiple" value={selectedDays} onValueChange={setSelectedDays} variant="outline" className="flex-wrap justify-start">
                                {daysOfWeek.map((day, index) => (
                                    <ToggleGroupItem key={daysOfWeek[index]} value={daysOfWeek[index]} aria-label={`Toggle ${daysOfWeek[index]}`} className="h-9 w-9">
                                        {dayAbbreviations[index]}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                          </div>

                          <div className="space-y-2">
                            <Label>2. Define time slots</Label>
                            {sharedTimeSlots.map((ts, index) => (
                                <div key={index} className="flex items-end gap-2">
                                   <div className="flex-grow">
                                      <Label className="text-xs font-normal">From</Label>
                                      <Input type="time" value={ts.from} onChange={(e) => {
                                          const newShared = [...sharedTimeSlots];
                                          newShared[index].from = e.target.value;
                                          setSharedTimeSlots(newShared);
                                      }} />
                                   </div>
                                   <div className="flex-grow">
                                      <Label className="text-xs font-normal">To</Label>
                                      <Input type="time" value={ts.to} onChange={(e) => {
                                          const newShared = [...sharedTimeSlots];
                                          newShared[index].to = e.target.value;
                                          setSharedTimeSlots(newShared);
                                      }} />
                                   </div>
                                   <Button type="button" variant="ghost" size="icon" onClick={() => setSharedTimeSlots(prev => prev.filter((_, i) => i !== index))} disabled={sharedTimeSlots.length <=1}>
                                        <Trash className="h-4 w-4 text-red-500" />
                                   </Button>
                                </div>
                            ))}
                            <Button type="button" size="sm" variant="outline" onClick={() => setSharedTimeSlots(prev => [...prev, { from: "", to: "" }])}>
                                Add Another Slot
                            </Button>
                          </div>
                          
                          <Button type="button" className="w-full" onClick={applySharedSlotsToSelectedDays}>
                            3. Apply to Selected Days
                          </Button>

                          <div className="space-y-2 pt-4">
                            <Label>Review and save</Label>
                            <div className="space-y-3 rounded-md border p-3 min-h-[100px]">
                                {watchedAvailabilitySlots.length > 0 ? watchedAvailabilitySlots.map((field, index) => (
                                   <div key={index} className="text-sm">
                                        <p className="font-semibold">{field.day}</p>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {field.timeSlots.map((ts, i) => {
                                              if (!ts.from || !ts.to) return null;
                                              return (
                                                <Badge key={i} variant="secondary" className="font-normal">
                                                  {format(parse(ts.from, 'HH:mm', new Date()), 'p')} - {format(parse(ts.to, 'HH:mm', new Date()), 'p')}
                                                </Badge>
                                              );
                                          })}
                                        </div>
                                    </div>
                                )) : <p className="text-xs text-muted-foreground text-center pt-6">No availability applied yet.</p>}
                            </div>
                          </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit">{isEditMode ? "Save Changes" : "Save Doctor"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
