

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
import { doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Doctor, Appointment, LeaveSlot, Department } from "@/lib/types";
import { format, parse, isSameDay, getDay, parse as parseDateFns } from "date-fns";
import { Clock, User, BriefcaseMedical, Calendar as CalendarIcon, Info, Edit, Save, X, Trash, Copy, Loader2, ChevronLeft, ChevronRight, Search, Star, Users, CalendarDays } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { TimeSlots } from "@/components/doctors/time-slots";
import { useForm, useFieldArray } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
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

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const timeSlotSchema = z.object({
  from: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  to: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
});

const availabilitySlotSchema = z.object({
  day: z.string(),
  timeSlots: z.array(timeSlotSchema).min(1, "At least one time slot is required."),
});

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
        className={cn("h-3 w-3", i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300")}
      />
    ))}
  </div>
);


const DoctorListItem = ({ doctor, onSelect, isSelected }: { doctor: Doctor, onSelect: () => void, isSelected: boolean }) => (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected ? "ring-2 ring-primary" : "hover:bg-muted/50"
      )}
      onClick={onSelect}
    >
        <CardContent className="p-4">
            <div className="flex items-center gap-4">
                <Image
                    src={doctor.avatar}
                    alt={doctor.name}
                    width={56}
                    height={56}
                    className="rounded-full object-cover border-2 border-primary/20"
                    data-ai-hint="doctor portrait"
                />
                <div className="flex-grow">
                    <p className={cn("font-bold text-md", isSelected && "text-primary")}>{doctor.name}</p>
                    <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <StarRating rating={4} />
                        <span className="text-xs text-muted-foreground">(120 Reviews)</span>
                    </div>
                </div>
            </div>
            <div className="mt-4 flex justify-between items-center text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{doctor.totalPatients ?? 'N/A'} Patients</span>
                </div>
                 <div className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    <span>{doctor.todaysAppointments ?? 'N/A'} Today</span>
                </div>
            </div>
        </CardContent>
        <CardFooter className="p-2 pt-0">
             <Badge
                variant={doctor.availability === "Available" ? "success" : "danger"}
                className="w-full justify-center"
            >
                {doctor.availability}
            </Badge>
        </CardFooter>
    </Card>
);

export default function DoctorsPage() {
  const [isPending, startTransition] = useTransition();

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

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBio, setNewBio] = useState("");
  const [newSpecialty, setNewSpecialty] = useState("");
  const [newDepartment, setNewDepartment] = useState("");

  const [isEditingAvailability, setIsEditingAvailability] = useState(false);
  
  const watchedAvailableDays = form.watch("availableDays");

  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [doctorsPerPage, setDoctorsPerPage] = useState(6);


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
      setNewName(selectedDoctor.name);
      setNewBio(selectedDoctor.bio || "");
      setNewSpecialty(selectedDoctor.specialty);
      setNewDepartment(selectedDoctor.department || "");
      form.reset({
        availableDays: selectedDoctor.availabilitySlots?.map(s => s.day) || [],
        availabilitySlots: selectedDoctor.availabilitySlots || [],
      });
      setIsEditingDetails(false);
      setIsEditingAvailability(false);
      setIsEditingTime(false);
    }
  }, [selectedDoctor, appointments, form]);

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
                    bio: newBio 
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


  return (
    <>
      <main className="flex-1 overflow-hidden bg-[#bcddef]/30">
        <div className="h-full grid grid-cols-12 gap-6 p-6">
          {/* Left Column: Doctor List */}
          <div className="col-span-12 lg:col-span-3 h-full">
             <Card className="h-full flex flex-col">
                <CardHeader>
                  <CardTitle>Doctors</CardTitle>
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
                <CardContent className="flex-grow overflow-y-auto pr-2 grid grid-cols-1 gap-4">
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
          <div className="col-span-12 lg:col-span-9 h-full overflow-y-auto pr-2">
            {selectedDoctor ? (
            <>
            <Card className="mb-6">
                <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-start gap-6 flex-grow">
                    <Image
                    src={selectedDoctor.avatar}
                    alt={selectedDoctor.name}
                    width={128}
                    height={128}
                    className="rounded-full border-4 border-primary/20 object-cover"
                    />
                    <div className="flex-grow">
                    {isEditingDetails ? (
                        <>
                            <div className="flex items-center gap-2">
                                <Input 
                                    value={newName} 
                                    onChange={(e) => setNewName(e.target.value)} 
                                    className="text-3xl font-bold h-12"
                                    disabled={isPending}
                                />
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <Input 
                                    value={newSpecialty} 
                                    onChange={(e) => setNewSpecialty(e.target.value)} 
                                    className="text-lg h-10"
                                    disabled={isPending}
                                />
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <Select onValueChange={setNewDepartment} value={newDepartment}>
                                    <SelectTrigger className="w-[200px] h-9">
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
                            <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-bold">{selectedDoctor.name}</h1>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className="text-lg text-muted-foreground">{selectedDoctor.specialty}</p>
                            </div>
                            <div className="flex items-center gap-2">
                            <p className="mt-2 text-sm text-muted-foreground">{selectedDoctor.department}</p>
                            </div>
                        </>
                        )}
                    <div className="flex items-center space-x-2 mt-4">
                        <Switch
                            id="status-switch"
                            checked={selectedDoctor.availability === 'Available'}
                            onCheckedChange={(checked) => handleStatusChange(checked ? 'Available' : 'Unavailable')}
                            disabled={isPending}
                        />
                        <Label htmlFor="status-switch" className={`font-semibold ${selectedDoctor.availability === 'Available' ? 'text-green-600' : 'text-red-600'}`}>
                            {selectedDoctor.availability === 'Available' ? 'In' : 'Out'}
                        </Label>
                    </div>
                    </div>
                </div>
                    {!isEditingDetails && (
                        <Button variant="outline" size="sm" onClick={() => setIsEditingDetails(true)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                        </Button>
                    )}
                </CardHeader>
            </Card>
            
            <Tabs defaultValue="details">
                <TabsList>
                <TabsTrigger value="details">Doctor Details</TabsTrigger>
                <TabsTrigger value="appointments">Appointments</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Info className="w-5 h-5" /> Bio</CardTitle>
                            </CardHeader>
                            <CardContent>
                            {isEditingDetails ? (
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
                            {isEditingDetails && (
                                <CardContent className="flex justify-end gap-2">
                                    <Button variant="ghost" onClick={() => {setIsEditingDetails(false); setNewName(selectedDoctor.name); setNewSpecialty(selectedDoctor.specialty); setNewDepartment(selectedDoctor.department || ""); setNewBio(selectedDoctor.bio || "");}} disabled={isPending}>Cancel</Button>
                                    <Button onClick={handleDetailsSave} disabled={isPending}>
                                        {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Details</>}
                                    </Button>
                                </CardContent>
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
                                        available: { backgroundColor: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))' },
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
                            <CardHeader>
                                <CardTitle>Quick Info</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <Clock className="w-5 h-5 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm text-muted-foreground">Avg. Consulting Time</p>
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
                                                <p className="font-semibold">{selectedDoctor.averageConsultingTime || "N/A"} minutes</p>
                                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingTime(true)}><Edit className="h-3 w-3"/></Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <User className="w-5 h-5 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm text-muted-foreground">Total Patients</p>
                                        <p className="font-semibold">{selectedDoctor.totalPatients ?? "N/A"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <BriefcaseMedical className="w-5 h-5 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm text-muted-foreground">Today's Appointments</p>
                                        <p className="font-semibold">{selectedDoctor.todaysAppointments ?? "N/A"}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="space-y-1.5">
                                    <CardTitle className="flex items-center gap-2"><CalendarIcon className="w-5 h-5" /> Weekly Availability</CardTitle>
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
                                                                : currentDays.filter((value) => value !== day);
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
                <TabsContent value="appointments" className="mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div>
                            <Card>
                                <CardContent className="p-2">
                                    <Calendar
                                        mode="single"
                                        selected={selectedDate}
                                        onSelect={setSelectedDate}
                                        className="w-full"
                                        defaultMonth={selectedDate}
                                        disabled={(date) => leaveDates.some(leaveDate => isSameDay(date, leaveDate))}
                                        modifiers={{ leave: leaveDates }}
                                        modifiersStyles={{ 
                                        leave: { color: 'red', textDecoration: 'line-through' },
                                        }}
                                    />
                                </CardContent>
                            </Card>
                        </div>
                        <div className="lg:col-span-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Appointments for {selectedDate ? format(selectedDate, "MMMM d, yyyy") : 'all time'}</CardTitle>
                                    <CardDescription>
                                        {isDoctorOnLeave 
                                            ? "The doctor is on leave on this day."
                                            : "A list of scheduled appointments for the selected date."}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Patient</TableHead>
                                                <TableHead>Age</TableHead>
                                                <TableHead>Gender</TableHead>
                                                <TableHead>Booked Via</TableHead>
                                                <TableHead>Token Number</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredAppointments.length > 0 && !isDoctorOnLeave ? (
                                                filteredAppointments.map((apt) => (
                                                    <TableRow key={apt.id} className={cn(isAppointmentOnLeave(apt) && "bg-red-100 dark:bg-red-900/30")}>
                                                        <TableCell className="font-medium">{apt.patientName}</TableCell>
                                                        <TableCell>{apt.age}</TableCell>
                                                        <TableCell>{apt.gender}</TableCell>
                                                        <TableCell>{apt.bookedVia}</TableCell>
                                                        <TableCell>{apt.tokenNumber}</TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center h-24">
                                                        {isDoctorOnLeave ? "Doctor on leave." : "No appointments for this day."}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
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
    </>
  );
}
