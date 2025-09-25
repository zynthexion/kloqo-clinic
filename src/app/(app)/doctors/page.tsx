

"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { doc, updateDoc, collection, getDocs, setDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Doctor, Appointment, LeaveSlot, Department, TimeSlot } from "@/lib/types";
import { format, parse, isSameDay, getDay, parse as parseDateFns } from "date-fns";
import { Clock, User, BriefcaseMedical, Calendar as CalendarIcon, Info, Edit, Save, X, Trash, Copy, Loader2, ChevronLeft, ChevronRight, Search, Star, Users, CalendarDays, Link as LinkIcon, PlusCircle, DollarSign, Printer, FileDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { TimeSlots } from "@/components/doctors/time-slots";
import { useForm, useFieldArray } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import Link from 'next/link';
import PatientsVsAppointmentsChart from "@/components/dashboard/patients-vs-appointments-chart";
import { DateRange } from "react-day-picker";
import { subDays } from 'date-fns';
import { AddDoctorForm } from "@/components/doctors/add-doctor-form";
import OverviewStats from "@/components/dashboard/overview-stats";
import AppointmentStatusChart from "@/components/dashboard/appointment-status-chart";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayAbbreviations = ["S", "M", "T", "W", "T", "F", "S"];

const timeSlotSchema = z.object({
  from: z.string().min(1, "Required"),
  to: z.string().min(1, "Required"),
});

const availabilitySlotSchema = z.object({
  day: z.string(),
  timeSlots: z.array(timeSlotSchema).min(1, "At least one time slot is required."),
});

const addDoctorFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  specialty: z.string().min(2, { message: "Specialty must be at least 2 characters." }),
  department: z.string().min(1, { message: "Please select a department." }),
  bio: z.string().min(10, { message: "Bio must be at least 10 characters." }),
  experience: z.coerce.number().min(0, "Years of experience cannot be negative."),
  consultationFee: z.coerce.number().min(0, "Consultation fee cannot be negative."),
  averageConsultingTime: z.coerce.number().min(5, "Must be at least 5 minutes."),
  availableDays: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one day.",
  }),
  availabilitySlots: z.array(availabilitySlotSchema),
  photo: z.any().optional(),
});
type AddDoctorFormValues = z.infer<typeof addDoctorFormSchema>;

const weeklyAvailabilityFormSchema = z.object({
  availabilitySlots: z.array(availabilitySlotSchema).refine(
    (slots) => slots.every((slot) => slot.timeSlots.length > 0),
    {
      message: "Each selected day must have at least one time slot.",
    }
  ),
});
type WeeklyAvailabilityFormValues = z.infer<typeof weeklyAvailabilityFormSchema>;

const StarRating = ({ rating }: { rating: number }) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        className={cn("h-4 w-4", i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300")}
      />
    ))}
  </div>
);

const DoctorListItem = ({ doctor, onSelect, isSelected }: { doctor: Doctor, onSelect: () => void, isSelected: boolean }) => (
    <Card
      className={cn(
        "p-3 flex items-center gap-3 cursor-pointer transition-all duration-200 border-2",
        isSelected ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/50"
      )}
      onClick={onSelect}
    >
        <div className="relative flex-shrink-0">
             <Image
                src={doctor.avatar}
                alt={doctor.name}
                width={40}
                height={40}
                className="rounded-full object-cover"
                data-ai-hint="doctor portrait"
            />
            <span className={cn(
                "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-white",
                doctor.availability === "Available" ? "bg-green-500" : "bg-red-500"
            )} />
        </div>
        <div>
            <p className="font-semibold text-sm">{doctor.name}</p>
            <p className="text-xs text-muted-foreground">{doctor.department}</p>
        </div>
    </Card>
);

export default function DoctorsPage() {
  const [isPending, startTransition] = useTransition();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState("details");

  const form = useForm<WeeklyAvailabilityFormValues>({
    resolver: zodResolver(weeklyAvailabilityFormSchema),
    defaultValues: {
      availabilitySlots: [],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "availabilitySlots",
  });
  
  const { toast } = useToast();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [leaveCalDate, setLeaveCalDate] = useState<Date | undefined>(new Date());
  
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [newAvgTime, setNewAvgTime] = useState<number | string>("");
  const [isEditingFee, setIsEditingFee] = useState(false);
  const [newFee, setNewFee] = useState<number | string>("");

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBio, setNewBio] = useState("");
  const [newSpecialty, setNewSpecialty] = useState("");
  const [newDepartment, setNewDepartment] = useState("");

  const [isEditingAvailability, setIsEditingAvailability] = useState(false);
  
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [sharedTimeSlots, setSharedTimeSlots] = useState<Array<{ from: string; to: string }>>([{ from: "09:00", to: "17:00" }]);

  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [doctorsPerPage, setDoctorsPerPage] = useState(10);
  const [isAddDoctorOpen, setIsAddDoctorOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);


  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [doctorsSnapshot, departmentsSnapshot, appointmentsSnapshot] = await Promise.all([
          getDocs(collection(db, "doctors")),
          getDocs(collection(db, "departments")),
          getDocs(collection(db, "appointments")),
        ]);

        const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);
        if (doctorsList.length > 0) {
          setSelectedDoctor(doctorsList[0]);
        }

        const departmentsList = departmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
        setDepartments(departmentsList);

        const appointmentsList = appointmentsSnapshot.docs.map(doc => doc.data() as Appointment);
        setAppointments(appointmentsList);


      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load data. Please try again.",
        });
      }
    };

    fetchAllData();
  }, [toast]);
  

  useEffect(() => {
    if (selectedDoctor) {
      const doctorAppointments = appointments.filter(
        (apt) => apt.doctor === selectedDoctor.name
      );

      if (doctorAppointments.length > 0) {
          try {
            const firstAptDate = parse(doctorAppointments[0].date, 'd MMMM yyyy', new Date());
            if (!isNaN(firstAptDate.getTime())) {
              setSelectedDate(firstAptDate);
            }
          } catch(e) {
              // ignore invalid date
          }
      }
      
      setNewAvgTime(selectedDoctor.averageConsultingTime || "");
      setNewFee(selectedDoctor.consultationFee || "");
      setNewName(selectedDoctor.name);
      setNewBio(selectedDoctor.bio || "");
      setNewSpecialty(selectedDoctor.specialty);
      setNewDepartment(selectedDoctor.department || "");
      form.reset({
        availabilitySlots: selectedDoctor.availabilitySlots?.map(s => ({
            ...s,
            timeSlots: s.timeSlots.map(ts => {
                try {
                    return {
                        from: format(parseDateFns(ts.from, 'hh:mm a', new Date()), 'HH:mm'),
                        to: format(parseDateFns(ts.to, 'hh:mm a', new Date()), 'HH:mm')
                    }
                } catch {
                    return { from: ts.from, to: ts.to }; // already in HH:mm
                }
            })
        })) || [],
      });
      setIsEditingDetails(false);
      setIsEditingBio(false);
      setIsEditingAvailability(false);
      setIsEditingTime(false);
      setIsEditingFee(false);
    }
  }, [selectedDoctor, appointments, form]);

    const handleSaveDoctor = async (doctorData: AddDoctorFormValues) => {
    startTransition(async () => {
      try {
        let photoUrl = doctorData.id ? doctors.find(d => d.id === doctorData.id)?.avatar : `https://picsum.photos/seed/new-doc-${Date.now()}/100/100`;

        if (doctorData.photo instanceof File) {
          const storageRef = ref(storage, `doctor_avatars/${Date.now()}_${doctorData.photo.name}`);
          await uploadBytes(storageRef, doctorData.photo);
          photoUrl = await getDownloadURL(storageRef);
        }

        const scheduleString = doctorData.availabilitySlots
          ?.sort((a, b) => daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day))
          .map(slot => `${slot.day}: ${slot.timeSlots.map(ts => `${format(parseDateFns(ts.from, "HH:mm", new Date()), "hh:mm a")}-${format(parseDateFns(ts.to, "HH:mm", new Date()), "hh:mm a")}`).join(', ')}`)
          .join('; ');

        const doctorToSave: Omit<Doctor, 'id'> = {
          name: doctorData.name,
          specialty: doctorData.specialty,
          department: doctorData.department,
          avatar: photoUrl!,
          schedule: scheduleString || "Not set",
          preferences: 'Not set',
          historicalData: 'No data',
          availability: 'Available',
          bio: doctorData.bio,
          experience: doctorData.experience,
          consultationFee: doctorData.consultationFee,
          averageConsultingTime: doctorData.averageConsultingTime,
          availabilitySlots: doctorData.availabilitySlots.map(s => ({...s, timeSlots: s.timeSlots.map(ts => ({
            from: format(parseDateFns(ts.from, "HH:mm", new Date()), "hh:mm a"),
            to: format(parseDateFns(ts.to, "HH:mm", new Date()), "hh:mm a")
          }))})),
        };

        const docId = doctorData.id || `doc-${Date.now()}`;
        await setDoc(doc(db, "doctors", docId), doctorToSave, { merge: true });
        
        const updatedDoctors = await getDocs(collection(db, "doctors"));
        const doctorsList = updatedDoctors.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);

        if (!doctorData.id) {
            setSelectedDoctor(doctorsList.find(d => d.name === doctorData.name) || null);
        } else {
            setSelectedDoctor(prev => prev && prev.id === docId ? { ...prev, ...doctorToSave, id: docId } : prev);
        }

        toast({
          title: `Doctor ${doctorData.id ? "Updated" : "Added"}`,
          description: `${doctorData.name} has been successfully ${doctorData.id ? "updated" : "added"}.`,
        });
      } catch (error) {
        console.error("Error saving doctor:", error);
        toast({
          variant: "destructive",
          title: "Save Failed",
          description: "Could not save doctor details.",
        });
      } finally {
        setIsAddDoctorOpen(false);
        setEditingDoctor(null);
      }
    });
  };

    const handleStatusChange = async (newStatus: 'Available' | 'Unavailable') => {
        if (!selectedDoctor) return;

        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, { availability: newStatus });
                const updatedDoctor = { ...selectedDoctor, availability: newStatus };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));
                toast({
                    title: "Status Updated",
                    description: `Dr. ${selectedDoctor.name} is now marked as ${newStatus === 'Available' ? 'In' : 'Out'}.`,
                });
            } catch (error) {
                console.error("Error updating status:", error);
                toast({
                    variant: "destructive",
                    title: "Update Failed",
                    description: "Could not update the doctor's status.",
                });
            }
        });
    };

    const handleTimeSave = async () => {
        if (!selectedDoctor || newAvgTime === "") return;
        const timeValue = Number(newAvgTime);
        if (isNaN(timeValue) || timeValue <= 0) {
             toast({ variant: "destructive", title: "Invalid Time", description: "Please enter a valid number." });
             return;
        }

        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, { averageConsultingTime: timeValue });
                const updatedDoctor = { ...selectedDoctor, averageConsultingTime: timeValue };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));
                setIsEditingTime(false);
                toast({
                    title: "Consulting Time Updated",
                    description: `Average consulting time set to ${timeValue} minutes.`,
                });
            } catch (error) {
                console.error("Error updating time:", error);
                toast({
                    variant: "destructive",
                    title: "Update Failed",
                    description: "Could not update the consulting time.",
                });
            }
        });
    }

    const handleFeeSave = async () => {
        if (!selectedDoctor || newFee === "") return;
        const feeValue = Number(newFee);
        if (isNaN(feeValue) || feeValue < 0) {
             toast({ variant: "destructive", title: "Invalid Fee", description: "Please enter a valid non-negative number." });
             return;
        }

        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, { consultationFee: feeValue });
                const updatedDoctor = { ...selectedDoctor, consultationFee: feeValue };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));
                setIsEditingFee(false);
                toast({
                    title: "Consultation Fee Updated",
                    description: `Consultation fee set to $${feeValue}.`,
                });
            } catch (error) {
                console.error("Error updating fee:", error);
                toast({
                    variant: "destructive",
                    title: "Update Failed",
                    description: "Could not update the consultation fee.",
                });
            }
        });
    };

    const handleDetailsSave = async () => {
        if (!selectedDoctor) return;
        if (newName.trim() === "" || newSpecialty.trim() === "" || newDepartment.trim() === "") {
            toast({ variant: "destructive", title: "Invalid Details", description: "Name, specialty, and department cannot be empty." });
            return;
        }

        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                const updatedData = { 
                    name: newName,
                    specialty: newSpecialty,
                    department: newDepartment,
                };
                await updateDoc(doctorRef, updatedData);
                const updatedDoctor = { ...selectedDoctor, ...updatedData };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));
                setIsEditingDetails(false);
                toast({
                    title: "Doctor Details Updated",
                    description: `Dr. ${newName}'s details have been updated.`,
                });
            } catch (error) {
                console.error("Error updating details:", error);
                toast({ variant: "destructive", title: "Update Failed", description: "Could not update doctor details." });
            }
        });
    };
    
    const handleBioSave = async () => {
        if (!selectedDoctor) return;
        
        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, { bio: newBio });
                const updatedDoctor = { ...selectedDoctor, bio: newBio };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));
                setIsEditingBio(false);
                toast({
                    title: "Bio Updated",
                    description: `Dr. ${selectedDoctor.name}'s bio has been updated.`,
                });
            } catch (error) {
                console.error("Error updating bio:", error);
                toast({ variant: "destructive", title: "Update Failed", description: "Could not update doctor's bio." });
            }
        });
    };

    const handleAvailabilitySave = (values: WeeklyAvailabilityFormValues) => {
        if (!selectedDoctor) return;

        const validSlots = values.availabilitySlots
          .map(slot => ({
            ...slot,
            timeSlots: slot.timeSlots.filter(ts => ts.from && ts.to)
          }))
          .filter(slot => slot.timeSlots.length > 0);
    
        const scheduleString = validSlots
          ?.sort((a, b) => daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day))
          .map(slot => `${slot.day}: ${slot.timeSlots.map(ts => `${format(parseDateFns(ts.from, "HH:mm", new Date()), "hh:mm a")}-${format(parseDateFns(ts.to, "HH:mm", new Date()), "hh:mm a")}`).join(', ')}`)
          .join('; ');

        const availabilitySlotsToSave = validSlots.map(s => ({...s, timeSlots: s.timeSlots.map(ts => ({
          from: format(parseDateFns(ts.from, "HH:mm", new Date()), "hh:mm a"),
          to: format(parseDateFns(ts.to, "HH:mm", new Date()), "hh:mm a")
        }))}));
    
        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, {
                    availabilitySlots: availabilitySlotsToSave,
                    schedule: scheduleString,
                });
                const updatedDoctor = { ...selectedDoctor, availabilitySlots: availabilitySlotsToSave, schedule: scheduleString };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));
                setIsEditingAvailability(false);
                toast({
                    title: "Availability Updated",
                    description: "Weekly availability has been successfully updated.",
                });
            } catch (error) {
                console.error("Error updating availability:", error);
                toast({
                    variant: "destructive",
                    title: "Update Failed",
                    description: "Could not update weekly availability.",
                });
            }
        });
    }

    const handleDeleteTimeSlot = async (day: string, timeSlot: TimeSlot) => {
        if (!selectedDoctor) return;
    
        const updatedAvailabilitySlots = selectedDoctor.availabilitySlots?.map(slot => {
            if (slot.day === day) {
                const updatedTimeSlots = slot.timeSlots.filter(ts => ts.from !== timeSlot.from || ts.to !== timeSlot.to);
                return { ...slot, timeSlots: updatedTimeSlots };
            }
            return slot;
        }).filter(slot => slot.timeSlots.length > 0);
    
        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, { availabilitySlots: updatedAvailabilitySlots });
                const updatedDoctor = { ...selectedDoctor, availabilitySlots: updatedAvailabilitySlots };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));
                toast({
                    title: "Time Slot Deleted",
                    description: `The time slot has been removed from ${day}.`,
                });
            } catch (error) {
                console.error("Error deleting time slot:", error);
                toast({
                    variant: "destructive",
                    title: "Update Failed",
                    description: "Could not delete the time slot.",
                });
            }
        });
    };

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
        const newSlotsMap = new Map<string, { day: string; timeSlots: { from: string; to: string }[] }>();
        
        currentFormSlots.forEach(slot => {
          newSlotsMap.set(slot.day, slot);
        });

        selectedDays.forEach(day => {
            newSlotsMap.set(day, { day, timeSlots: validSharedTimeSlots });
        });

        const updatedSlots = Array.from(newSlotsMap.values()).filter(slot => slot.timeSlots.length > 0);
        
        form.setValue('availabilitySlots', updatedSlots, { shouldDirty: true });
        
        toast({
            title: "Time Slots Applied",
            description: `The defined time slots have been applied to the selected days.`,
        });

        setSelectedDays([]);
    };

    const handleLeaveUpdate = async (updatedLeaveSlots: LeaveSlot[]) => {
        if (!selectedDoctor) return;
        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, { leaveSlots: updatedLeaveSlots });
                const updatedDoctor = { ...selectedDoctor, leaveSlots: updatedLeaveSlots };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));

                toast({
                    title: "Leave Updated",
                    description: `Leave schedule for Dr. ${selectedDoctor.name} has been updated.`,
                });
            } catch (error) {
                console.error("Error updating leave:", error);
                toast({
                    variant: "destructive",
                    title: "Update Failed",
                    description: "Could not update leave information.",
                });
            }
        });
    };

    const doctorAppointments = useMemo(() => {
        if (!selectedDoctor) return [];
        return appointments.filter(apt => apt.doctor === selectedDoctor.name);
    }, [appointments, selectedDoctor]);


  const filteredAppointments = useMemo(() => {
    if (!selectedDate) return [];

    return doctorAppointments.filter((appointment) => {
        try {
            const parsedDate = parse(appointment.date, 'd MMMM yyyy', new Date());
            return isSameDay(parsedDate, selectedDate);
        } catch (e) {
            console.error("Error parsing date:", e);
            return false;
        }
    });
  }, [doctorAppointments, selectedDate]);
  
  const availableDaysOfWeek = useMemo(() => {
    if (!selectedDoctor?.availabilitySlots) return [];
    const dayNames = selectedDoctor.availabilitySlots.map(s => s.day);
    return daysOfWeek.reduce((acc, day, index) => {
        if (dayNames.includes(day)) {
            acc.push(index);
        }
        return acc;
    }, [] as number[]);
  }, [selectedDoctor?.availabilitySlots]);

  const leaveDates = useMemo(() => {
      return (selectedDoctor?.leaveSlots || [])
          .filter(ls => ls.slots.length > 0)
          .map(ls => parse(ls.date, 'yyyy-MM-dd', new Date()));
  }, [selectedDoctor?.leaveSlots]);

  const isAppointmentOnLeave = (appointment: Appointment): boolean => {
      if (!selectedDoctor?.leaveSlots || !appointment) return false;
      
      const aptDate = parse(appointment.date, "d MMMM yyyy", new Date());
      const leaveForDay = selectedDoctor.leaveSlots.find(ls => isSameDay(parse(ls.date, "yyyy-MM-dd", new Date()), aptDate));
      
      if (!leaveForDay) return false;

      const aptTime = parseDateFns(appointment.time, "hh:mm a", new Date(0));
      
      return leaveForDay.slots.some(leaveSlot => {
          const leaveStart = parseDateFns(leaveSlot.from, "hh:mm a", new Date(0));
          const leaveEnd = parseDateFns(leaveSlot.to, "hh:mm a", new Date(0));
          return aptTime >= leaveStart && aptTime < leaveEnd;
      });
  };

  const isDoctorOnLeave = selectedDate ? leaveDates.some(d => isSameDay(d, selectedDate)) : false;
  
  const filteredDoctors = useMemo(() => {
    return doctors.filter(doctor => {
        const searchTermLower = searchTerm.toLowerCase();
        
        const matchesSearchTerm = (
            doctor.name.toLowerCase().includes(searchTermLower) ||
            doctor.specialty.toLowerCase().includes(searchTermLower)
        );

        const matchesDepartment = departmentFilter === 'All' || doctor.department === departmentFilter;

        return matchesSearchTerm && matchesDepartment;
    });
  }, [doctors, searchTerm, departmentFilter]);

  const totalPages = Math.ceil(filteredDoctors.length / doctorsPerPage);
  const currentDoctors = filteredDoctors.slice(
      (currentPage - 1) * doctorsPerPage,
      currentPage * doctorsPerPage
  );

  const openAddDoctorDialog = () => {
    setEditingDoctor(null);
    setIsAddDoctorOpen(true);
  };


  return (
    <>
      <main className="flex-1 overflow-hidden bg-background">
        <div className="h-full grid grid-cols-1 md:grid-cols-12 gap-6 p-6">
          {/* Left Column: Doctor List */}
          <div className="h-full md:col-span-3">
             <Card className="h-full flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Doctors</CardTitle>
                    <Button onClick={openAddDoctorDialog}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add Doctor
                    </Button>
                  </div>
                   <div className="relative mt-2">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                      type="search"
                      placeholder="Search name or specialty"
                      className="w-full rounded-lg bg-background pl-8"
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                      />
                  </div>
                   <Select value={departmentFilter} onValueChange={(value) => { setDepartmentFilter(value); setCurrentPage(1); }}>
                      <SelectTrigger className="w-full mt-2">
                        <SelectValue placeholder="Department" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="All">All Departments</SelectItem>
                          {departments.map(dept => (
                              <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="flex-grow overflow-y-auto space-y-2 px-4 pt-0">
                    {currentDoctors.map(doctor => (
                        <DoctorListItem 
                            key={doctor.id}
                            doctor={doctor}
                            onSelect={() => setSelectedDoctor(doctor)}
                            isSelected={selectedDoctor?.id === doctor.id}
                        />
                    ))}
                </CardContent>
                <CardFooter className="pt-4 flex items-center justify-between">
                   <div className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                   </div>
                   <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                   </div>
                </CardFooter>
             </Card>
          </div>

          {/* Right Column: Doctor Details */}
          <div className="h-full overflow-y-auto pr-2 md:col-span-9">
            {selectedDoctor ? (
            <>
            <div className="bg-primary text-primary-foreground rounded-lg p-4 flex items-start gap-6 mb-6">
                <div className="relative flex-shrink-0">
                    <Image
                        src={selectedDoctor.avatar}
                        alt={selectedDoctor.name}
                        width={112}
                        height={112}
                        className="rounded-md object-cover"
                        data-ai-hint="doctor portrait"
                    />
                </div>
                <div className="flex-grow text-white space-y-1.5">
                    {isEditingDetails ? (
                       <>
                        <div className="flex items-center gap-2">
                            <Input 
                                value={newName} 
                                onChange={(e) => setNewName(e.target.value)} 
                                className="text-2xl font-bold h-10 bg-transparent border-white/50"
                                disabled={isPending}
                            />
                        </div>
                         <div className="flex items-center gap-2 mt-1">
                            <Input 
                                value={newSpecialty} 
                                onChange={(e) => setNewSpecialty(e.target.value)} 
                                className="text-md h-9 bg-transparent border-white/50"
                                disabled={isPending}
                            />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <Select onValueChange={setNewDepartment} value={newDepartment}>
                                <SelectTrigger className="w-[200px] h-9 bg-transparent border-white/50">
                                    <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                                <SelectContent>
                                    {departments.map(dept => (
                                        <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                       </>
                    ) : (
                       <>
                        <p className="font-bold text-2xl">{selectedDoctor.name}</p>
                        <p className="text-md opacity-90">
                            {selectedDoctor.degrees?.join(", ")} - {selectedDoctor.department}
                        </p>
                       </>
                    )}
                    <p className="text-md opacity-90">{selectedDoctor.experience} Years of experience</p>
                    <div className="flex items-center gap-2">
                        <StarRating rating={selectedDoctor.rating || 0} />
                        <span className="text-md opacity-90">({selectedDoctor.reviews}+ Reviews)</span>
                    </div>
                     {isEditingDetails && (
                        <div className="flex justify-start gap-2 pt-2">
                            <Button size="sm" variant="ghost" className="text-white hover:bg-white/20" onClick={() => {setIsEditingDetails(false); setNewName(selectedDoctor.name); setNewSpecialty(selectedDoctor.specialty); setNewDepartment(selectedDoctor.department || "");}} disabled={isPending}>Cancel</Button>
                            <Button size="sm" className="bg-white text-primary hover:bg-white/90" onClick={handleDetailsSave} disabled={isPending}>
                                {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save</>}
                            </Button>
                        </div>
                    )}
                </div>
                <div className="flex flex-col items-end justify-between h-full">
                    {!isEditingDetails && (
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setIsEditingDetails(true)}>
                            <Edit className="h-5 w-5" />
                        </Button>
                    )}
                    <div className="flex items-center space-x-2 bg-primary p-2 rounded-md">
                      <Switch
                        id="status-switch"
                        checked={selectedDoctor.availability === 'Available'}
                        onCheckedChange={(checked) => handleStatusChange(checked ? 'Available' : 'Unavailable')}
                        disabled={isPending}
                        className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
                      />
                      <Label htmlFor="status-switch" className="font-semibold text-white">
                        {selectedDoctor.availability === 'Available' ? 'In' : 'Out'}
                      </Label>
                   </div>
                </div>
            </div>

            {activeTab !== 'analytics' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Avg. Consulting Time</CardTitle>
                          <Clock className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                          {isEditingTime ? (
                              <div className="flex items-center gap-2 mt-1">
                                  <Input 
                                      type="number" 
                                      value={newAvgTime} 
                                      onChange={(e) => setNewAvgTime(e.target.value)} 
                                      className="w-20 h-8"
                                      disabled={isPending}
                                  />
                                  <Button size="icon" className="h-8 w-8" onClick={handleTimeSave} disabled={isPending}><Save className="h-4 w-4"/></Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {setIsEditingTime(false); setNewAvgTime(selectedDoctor.averageConsultingTime || "")}} disabled={isPending}><X className="h-4 w-4"/></Button>
                              </div>
                          ) : (
                              <div className="flex items-center gap-2">
                                  <p className="text-2xl font-bold">{selectedDoctor.averageConsultingTime || 0} min</p>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingTime(true)}><Edit className="h-3 w-3"/></Button>
                              </div>
                          )}
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Consultation Fee</CardTitle>
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                          {isEditingFee ? (
                              <div className="flex items-center gap-2 mt-1">
                                  <Input 
                                      type="number" 
                                      value={newFee} 
                                      onChange={(e) => setNewFee(e.target.value)} 
                                      className="w-20 h-8"
                                      disabled={isPending}
                                  />
                                  <Button size="icon" className="h-8 w-8" onClick={handleFeeSave} disabled={isPending}><Save className="h-4 w-4"/></Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {setIsEditingFee(false); setNewFee(selectedDoctor.consultationFee || "")}} disabled={isPending}><X className="h-4 w-4"/></Button>
                              </div>
                          ) : (
                              <div className="flex items-center gap-2">
                                  <p className="text-2xl font-bold">${selectedDoctor.consultationFee || 0}</p>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingFee(true)}><Edit className="h-3 w-3"/></Button>
                              </div>
                          )}
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
                          <Users className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                          <div className="text-2xl font-bold">{selectedDoctor.totalPatients || 0}</div>
                      </CardContent>
                  </Card>
                  <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Today's Appointments</CardTitle>
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                          <div className="text-2xl font-bold">{selectedDoctor.todaysAppointments || 0}</div>
                      </CardContent>
                  </Card>
              </div>
            )}
            
            <hr className="my-6" />

            <Tabs defaultValue="details" onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="details">Doctor Details</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                    <TabsTrigger value="reviews">Reviews</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="space-y-1.5">
                                   <CardTitle className="flex items-center gap-2"><Info className="w-5 h-5" /> Bio</CardTitle>
                                </div>
                                {!isEditingBio && (
                                    <Button variant="outline" size="sm" onClick={() => setIsEditingBio(true)}>
                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                    </Button>
                                )}
                            </CardHeader>
                            <CardContent>
                            {isEditingBio ? (
                                    <div className="space-y-2">
                                        <Textarea 
                                            value={newBio} 
                                            onChange={(e) => setNewBio(e.target.value)} 
                                            className="min-h-[120px]"
                                            disabled={isPending}
                                        />
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground">{selectedDoctor.bio || "No biography available."}</p>
                                )}
                            </CardContent>
                            {isEditingBio && (
                                <CardFooter className="flex justify-end gap-2">
                                    <Button variant="ghost" onClick={() => {setIsEditingBio(false); setNewBio(selectedDoctor.bio || "");}} disabled={isPending}>Cancel</Button>
                                    <Button onClick={handleBioSave} disabled={isPending}>
                                        {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Bio</>}
                                    </Button>
                                </CardFooter>
                            )}
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><CalendarIcon className="w-5 h-5" /> Mark Leave</CardTitle>
                                <CardDescription>Select dates to view or edit time slot availability.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Calendar
                                    mode="single"
                                    selected={leaveCalDate}
                                    onSelect={setLeaveCalDate}
                                    className="rounded-md border w-full"
                                    modifiers={{ 
                                        available: { dayOfWeek: availableDaysOfWeek },
                                        leave: leaveDates,
                                    }}
                                    modifiersStyles={{
                                        available: { backgroundColor: '#D4EDDA', color: '#155724' },
                                        leave: { color: 'red', fontWeight: 'bold' }
                                    }}
                                />
                                <TimeSlots
                                selectedDate={leaveCalDate}
                                availabilitySlots={selectedDoctor.availabilitySlots || []}
                                leaveSlots={selectedDoctor.leaveSlots || []}
                                appointments={doctorAppointments}
                                onLeaveUpdate={handleLeaveUpdate}
                                isPending={isPending}
                                />
                            </CardContent>
                        </Card>
                    </div>
                    <div className="space-y-6">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="space-y-1.5">
                                    <CardTitle className="flex items-center gap-2"><CalendarIcon className="w-5 h-5" /> Schedule</CardTitle>
                                    <CardDescription>Recurring weekly schedule.</CardDescription>
                                </div>
                                {!isEditingAvailability && (
                                    <Button variant="outline" size="sm" onClick={() => setIsEditingAvailability(true)}>
                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                    </Button>
                                )}
                            </CardHeader>
                            <CardContent>
                            {isEditingAvailability ? (
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(handleAvailabilitySave)} className="space-y-4">
                                        
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
                                        <div className="space-y-3 rounded-md border p-3 max-h-48 overflow-y-auto">
                                            {fields.map((field, index) => (
                                               <div key={field.id} className="flex items-start text-sm">
                                                  <p className="w-28 font-semibold">{field.day}</p>
                                                  <div className="flex flex-wrap gap-1">
                                                      {field.timeSlots.map((ts, i) => {
                                                          if (!ts.from || !ts.to) return null;
                                                          try {
                                                            return (
                                                              <Badge key={i} variant="secondary" className="font-normal">
                                                                {format(parseDateFns(ts.from, "HH:mm", new Date()), "hh:mm a")} - {format(parseDateFns(ts.to, "HH:mm", new Date()), "hh:mm a")}
                                                              </Badge>
                                                            );
                                                          } catch (e) {
                                                            return <Badge key={i} variant="destructive">Invalid</Badge>;
                                                          }
                                                      })}
                                                  </div>
                                               </div>
                                            ))}
                                        </div>
                                      </div>


                                      <div className="flex justify-end gap-2 mt-4">
                                        <Button type="button" variant="ghost" onClick={() => setIsEditingAvailability(false)} disabled={isPending}>Cancel</Button>
                                        <Button type="submit" disabled={isPending}>
                                            {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : 'Save Schedule'}
                                        </Button>
                                      </div>
                                  </form>
                                </Form>
                            ) : (
                                <div className="space-y-3">
                                    {selectedDoctor.availabilitySlots && selectedDoctor.availabilitySlots.length > 0 ? (
                                        selectedDoctor.availabilitySlots
                                        .slice()
                                        .sort((a, b) => daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day))
                                        .map((slot, index) => (
                                            <React.Fragment key={index}>
                                            <div className="flex items-start">
                                                <p className="w-24 font-semibold text-sm pt-1">{slot.day}</p>
                                                <div className="flex flex-wrap gap-2 items-center">
                                                    {slot.timeSlots.map((ts, i) => (
                                                        <Badge key={i} variant="outline" className="text-sm group relative pr-7">
                                                            {ts.from} - {ts.to}
                                                            <button 
                                                                onClick={() => handleDeleteTimeSlot(slot.day, ts)}
                                                                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <X className="h-3 w-3 text-red-500" />
                                                            </button>
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                            {index < selectedDoctor.availabilitySlots!.length -1 && <Separator className="my-3"/>}
                                            </React.Fragment>
                                        ))
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No availability slots defined.</p>
                                    )}
                                </div>
                            )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
                </TabsContent>
                <TabsContent value="analytics" className="mt-4 space-y-6">
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">
                        {dateRange?.from ? 
                            dateRange.to ? `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`
                            : format(dateRange.from, "LLL dd, y")
                            : "Select a date range"
                        }
                        </p>
                        <div className="flex items-center gap-2">
                            <DateRangePicker 
                                onDateChange={setDateRange}
                                initialDateRange={dateRange}
                            />
                            <Button variant="outline" size="icon">
                                <Printer className="h-4 w-4" />
                                <span className="sr-only">Print</span>
                            </Button>
                            <Button variant="outline" size="icon">
                                <FileDown className="h-4 w-4" />
                                <span className="sr-only">Download PDF</span>
                            </Button>
                        </div>
                    </div>
                    <OverviewStats dateRange={dateRange} doctorId={selectedDoctor.id} />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <AppointmentStatusChart dateRange={dateRange} doctorId={selectedDoctor.id} />
                        <PatientsVsAppointmentsChart dateRange={dateRange} />
                    </div>
                </TabsContent>
                <TabsContent value="reviews" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Patient Reviews</CardTitle>
                            <CardDescription>What patients are saying about Dr. {selectedDoctor.name}.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">Review functionality coming soon.</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
            </>
            ) : (
                 <Card className="h-full flex items-center justify-center">
                    <p className="text-muted-foreground">Select a doctor to view details</p>
                 </Card>
            )}
          </div>
        </div>
      </main>

      <AddDoctorForm
        onSave={handleSaveDoctor}
        isOpen={isAddDoctorOpen}
        setIsOpen={setIsAddDoctorOpen}
        doctor={editingDoctor}
        departments={departments}
      />
    </>
  );
}

