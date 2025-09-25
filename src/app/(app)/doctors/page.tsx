
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
import type { Doctor, Appointment, LeaveSlot, Department } from "@/lib/types";
import { format, parse, isSameDay, getDay, parse as parseDateFns } from "date-fns";
import { Clock, User, BriefcaseMedical, Calendar as CalendarIcon, Info, Edit, Save, X, Trash, Copy, Loader2, ChevronLeft, ChevronRight, Search, Star, Users, CalendarDays, Link as LinkIcon, PlusCircle, DollarSign, Printer, FileDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { TimeSlots } from "@/components/doctors/time-slots";
import { useForm, useFieldArray } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";
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

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const timeSlotSchema = z.object({
  from: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  to: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
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

const formSchema = z.object({
  availableDays: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one day.",
  }),
  availabilitySlots: z.array(availabilitySlotSchema),
});

type WeeklyAvailabilityFormValues = z.infer<typeof formSchema>;

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
    defaultValues: {
      availableDays: [],
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
  
  const watchedAvailableDays = form.watch("availableDays");

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
          const firstAptDate = parse(doctorAppointments[0].date, 'd MMMM yyyy', new Date());
          if (!isNaN(firstAptDate.getTime())) {
            setSelectedDate(firstAptDate);
          }
      }
      
      setNewAvgTime(selectedDoctor.averageConsultingTime || "");
      setNewFee(selectedDoctor.consultationFee || "");
      setNewName(selectedDoctor.name);
      setNewBio(selectedDoctor.bio || "");
      setNewSpecialty(selectedDoctor.specialty);
      setNewDepartment(selectedDoctor.department || "");
      form.reset({
        availableDays: selectedDoctor.availabilitySlots?.map(s => s.day) || [],
        availabilitySlots: selectedDoctor.availabilitySlots || [],
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
          .map(slot => `${slot.day}: ${slot.timeSlots.map(ts => `${ts.from}-${ts.to}`).join(', ')}`)
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
          availabilitySlots: doctorData.availabilitySlots,
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

        const scheduleString = values.availabilitySlots
          ?.sort((a, b) => daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day))
          .map(slot => `${slot.day}: ${slot.timeSlots.map(ts => `${ts.from}-${ts.to}`).join(', ')}`)
          .join('; ');

        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, {
                    availabilitySlots: values.availabilitySlots,
                    schedule: scheduleString,
                });
                const updatedDoctor = { ...selectedDoctor, availabilitySlots: values.availabilitySlots, schedule: scheduleString };
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
          const leaveStart = parseDateFns(leaveSlot.from, "HH:mm", new Date(0));
          const leaveEnd = parseDateFns(leaveSlot.to, "HH:mm", new Date(0));
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
                                    <form onSubmit={form.handleSubmit(handleAvailabilitySave)} className="space-y-6">
                                        <FormField
                                            control={form.control}
                                            name="availableDays"
                                            render={() => (
                                            <FormItem>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {daysOfWeek.map((day) => (
                                                    <FormField
                                                    key={day}
                                                    control={form.control}
                                                    name="availableDays"
                                                    render={({ field }) => (
                                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
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
                                                                append({ day: day, timeSlots: [{ from: "09:00", to: "17:00" }] });
                                                                } else if (!checked && dayIndex > -1) {
                                                                remove(dayIndex);
                                                                }
                                                            }}
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="font-normal text-sm">{day}</FormLabel>
                                                        </FormItem>
                                                    )}
                                                    />
                                                ))}
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                        
                                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                                        {fields.map((field, dayIndex) => {
                                            const timeSlotsArray = form.getValues(`availabilitySlots.${dayIndex}.timeSlots`);
                                            return (
                                                <div key={field.id} className="space-y-2 p-3 border rounded-md bg-muted/50">
                                                    <h4 className="font-semibold text-sm">{field.day} Time Slots</h4>
                                                    {timeSlotsArray.map((_, timeIndex) => (
                                                        <div key={timeIndex} className="flex items-end gap-2">
                                                            <FormField
                                                                control={form.control}
                                                                name={`availabilitySlots.${dayIndex}.timeSlots.${timeIndex}.from`}
                                                                render={({ field }) => (
                                                                    <FormItem className="flex-grow">
                                                                        <FormLabel className="text-xs">From</FormLabel>
                                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                                <FormControl>
                                                                                    <SelectTrigger className="h-8">
                                                                                        <SelectValue placeholder="HH:MM" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent>
                                                                                    {timeOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                                                                </SelectContent>
                                                                            </Select>
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
                                                                                    <SelectTrigger className="h-8">
                                                                                        <SelectValue placeholder="HH:MM" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent>
                                                                                    {timeOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                                                                </SelectContent>
                                                                            </Select>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                            <Button type="button" variant="ghost" size="icon" onClick={() => copyTimeSlotToAllDays(dayIndex, timeIndex)}><Copy className="h-4 w-4" /></Button>
                                                            <Button type="button" variant="ghost" size="icon" onClick={() => {
                                                                const currentSlots = form.getValues(`availabilitySlots.${dayIndex}.timeSlots`);
                                                                if (currentSlots.length > 1) {
                                                                const newSlots = currentSlots.filter((_, i) => i !== timeIndex);
                                                                update(dayIndex, { ...form.getValues(`availabilitySlots.${dayIndex}`), timeSlots: newSlots });
                                                                }
                                                            }}><Trash className="h-4 w-4" /></Button>
                                                        </div>
                                                    ))}
                                                    <Button type="button" size="sm" variant="outline" onClick={() => {
                                                        const currentSlots = form.getValues(`availabilitySlots.${dayIndex}.timeSlots`);
                                                        const newSlots = [...currentSlots, { from: "", to: "" }];
                                                        update(dayIndex, { ...form.getValues(`availabilitySlots.${dayIndex}`), timeSlots: newSlots });
                                                    }}>Add Slot</Button>
                                                </div>
                                            )
                                        })}
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Button type="button" variant="ghost" onClick={() => setIsEditingAvailability(false)} disabled={isPending}>Cancel</Button>
                                            <Button type="submit" disabled={isPending}>
                                                {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : 'Save Changes'}
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
                                            <div key={index} className="flex items-start">
                                                <p className="w-28 font-semibold text-sm">{slot.day}</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {slot.timeSlots.map((ts, i) => (
                                                        <Badge key={i} variant="outline" className="text-sm">{ts.from} - {ts.to}</Badge>
                                                    ))}
                                                </div>
                                            </div>
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

    