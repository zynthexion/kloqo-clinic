
"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Appointment, Doctor, Patient } from "@/lib/types";
import { collection, getDocs, setDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { parse, isSameDay, parse as parseDateFns, format, getDay, isPast, isFuture, isToday } from "date-fns";
import { cn } from "@/lib/utils";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, FileDown, Filter, Printer, Search, MoreHorizontal, Eye, Edit, Trash2, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import WeeklyDoctorAvailability from "@/components/dashboard/weekly-doctor-availability";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formSchema = z.object({
  id: z.string().optional(),
  patientName: z.string().min(2, { message: "Name must be at least 2 characters." }),
  gender: z.enum(["Male", "Female", "Other"]),
  phone: z.string().min(10, { message: "Phone number must be at least 10 digits." }),
  age: z.coerce.number().min(0, "Age cannot be negative."),
  doctor: z.string().min(1, { message: "Please select a doctor." }),
  date: z.date({
    required_error: "A date is required.",
  }),
  time: z.string().min(1, "Please select a time."),
  place: z.string().min(2, { message: "Place must be at least 2 characters." }),
  bookedVia: z.enum(["Phone", "Walk-in"]),
  tokenNumber: z.string().optional(),
});

type AddAppointmentFormValues = z.infer<typeof formSchema>;

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];


export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[]>([]);
  const [isPatientPopoverOpen, setIsPatientPopoverOpen] = useState(false);
  const [bookingType, setBookingType] = useState("existing");

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [drawerSearchTerm, setDrawerSearchTerm] = useState("");
  const [filterAvailableDoctors, setFilterAvailableDoctors] = useState(false);
  const [activeTab, setActiveTab] = useState("upcoming");


  const { toast } = useToast();

  const isEditing = !!editingAppointment;

  const form = useForm<AddAppointmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientName: "",
      phone: "",
      age: 0,
      doctor: "",
      date: undefined,
      time: undefined,
      place: "",
      bookedVia: "Phone",
    },
  });
  
  const patientInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (patientSearchTerm.length > 1) {
      const results = allPatients.filter(p =>
        p.phone.includes(patientSearchTerm)
      );
      setPatientSearchResults(results);
      setIsPatientPopoverOpen(true);
    } else {
      setPatientSearchResults([]);
      setIsPatientPopoverOpen(false);
    }
  }, [patientSearchTerm, allPatients]);


  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch all appointments
        const appointmentsCollection = collection(db, "appointments");
        const appointmentsSnapshot = await getDocs(appointmentsCollection);
        const appointmentsList = appointmentsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Appointment));
        setAppointments(appointmentsList);

        // Fetch all patients from the 'patients' collection
        const patientsCollection = collection(db, "patients");
        const patientsSnapshot = await getDocs(patientsCollection);
        const patientsList = patientsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Patient));
        setAllPatients(patientsList);

        // Fetch all doctors
        const doctorsCollection = collection(db, "doctors");
        const doctorsSnapshot = await getDocs(doctorsCollection);
        const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const resetForm = () => {
    setEditingAppointment(null);
    setSelectedDoctorId(null);
    setPatientSearchTerm("");
    form.reset({
      patientName: "", gender: "Male", phone: "", age: 0, doctor: "",
      date: undefined, time: undefined,
      place: "",
      bookedVia: "Phone",
    });
  }

  useEffect(() => {
    if (editingAppointment) {
        const doctor = doctors.find(d => d.name === editingAppointment.doctor);
        if (doctor) {
            const appointmentDate = parse(editingAppointment.date, "d MMMM yyyy", new Date());
            form.reset({
                ...editingAppointment,
                date: isNaN(appointmentDate.getTime()) ? undefined : appointmentDate,
                doctor: doctor.id,
                time: format(parseDateFns(editingAppointment.time, "hh:mm a", new Date()), 'HH:mm'),
                bookedVia: (editingAppointment.bookedVia === "Phone" || editingAppointment.bookedVia === "Walk-in") ? editingAppointment.bookedVia : "Phone"
            });
            setPatientSearchTerm(editingAppointment.phone);
            setSelectedDoctorId(doctor.id);
            setBookingType("existing");
        }
    } else {
        resetForm();
    }
  }, [editingAppointment, form, doctors]);


  const selectedDoctor = useMemo(() => {
    return doctors.find(d => d.id === selectedDoctorId) || null;
  }, [doctors, selectedDoctorId]);

  const selectedDate = form.watch("date");

  async function onSubmit(values: AddAppointmentFormValues) {
    try {
      const doctorName = doctors.find(d => d.id === values.doctor)?.name || "Unknown Doctor";
      const appointmentDateStr = format(values.date, "d MMMM yyyy");

      if (bookingType === 'new' && !isEditing) {
        const patientId = encodeURIComponent(`${values.patientName}-${values.phone}`);
        const patientRef = doc(db, "patients", patientId);
        
        const newPatientData: Patient = {
          id: patientId,
          name: values.patientName,
          age: values.age,
          gender: values.gender,
          phone: values.phone,
          place: values.place,
          lastVisit: appointmentDateStr,
          doctor: doctorName,
          totalAppointments: 1,
        };
        await setDoc(patientRef, newPatientData, { merge: true });
        // Refresh patient list
        setAllPatients(prev => [...prev, newPatientData]);
      }

      const dataToSave: Omit<AddAppointmentFormValues, 'date' | 'time'> & { date: string, time: string, status: 'Confirmed' | 'Pending' | 'Cancelled', treatment: string } = {
          ...values,
          date: appointmentDateStr,
          time: format(parseDateFns(values.time, "HH:mm", new Date()), "hh:mm a"),
          doctor: doctorName,
          status: "Pending",
          treatment: "General Consultation",
      };

      if (isEditing) {
          const { id, ...restOfData } = dataToSave;
          if (!id) throw new Error("Editing an appointment without an ID.");
          const appointmentRef = doc(db, "appointments", id);
          await setDoc(appointmentRef, restOfData, { merge: true });

          setAppointments(prev => {
              return prev.map(apt => apt.id === id ? { ...apt, ...restOfData, id: id } : apt);
          });
          toast({
              title: "Appointment Rescheduled",
              description: `Appointment for ${restOfData.patientName} has been updated.`,
          });
      } else {
          const appointmentId = `APT-${Date.now()}`;
          const tokenNumber = `${(appointments.length + 1).toString().padStart(3, '0')}`;
          
          const newAppointmentData: Appointment = {
              ...dataToSave,
              id: appointmentId,
              tokenNumber: tokenNumber,
          };
          const appointmentRef = doc(db, "appointments", appointmentId);
          await setDoc(appointmentRef, newAppointmentData);
          setAppointments(prev => [...prev, newAppointmentData]);
          toast({
              title: "Appointment Booked",
              description: `Appointment for ${newAppointmentData.patientName} has been successfully booked.`,
          });
      }
    } catch (error) {
      console.error("Error saving appointment: ", error);
      toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save appointment. Please try again.",
      });
    } finally {
      resetForm();
    }
  }

  const onDoctorChange = (doctorId: string) => {
    form.setValue("doctor", doctorId);
    setSelectedDoctorId(doctorId);
    const doctor = doctors.find(d => d.id === doctorId);
    if (doctor) {
      form.setValue("date", undefined, { shouldValidate: true });
      form.setValue("time", undefined, { shouldValidate: true });
    }
  }

  const handlePatientSelect = (patient: Patient) => {
    form.setValue("patientName", patient.name);
    form.setValue("age", patient.age);
    form.setValue("gender", patient.gender);
    form.setValue("phone", patient.phone);
    form.setValue("place", patient.place || "");
    setPatientSearchTerm(patient.phone);
    setIsPatientPopoverOpen(false);
    patientInputRef.current?.blur();
  }
  
  const handlePatientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // For "new" tab, it's a direct input for patient name
    if (bookingType === 'new') {
        form.setValue("patientName", value);
    } else { // For "existing" tab, it's for searching
        setPatientSearchTerm(value);
        if (isEditing) {
            form.setValue("phone", value);
        }
    }

    if (isDrawerExpanded) {
        setIsDrawerExpanded(false);
    }
  };

  const handleBookingTypeChange = (value: string) => {
    setBookingType(value);
    setPatientSearchTerm("");
    form.setValue("patientName", "");
    form.setValue("age", 0);
    form.setValue("gender", "Male");
    form.setValue("phone", "");
    form.setValue("place", "");
    form.clearErrors();
  };

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
    if (!selectedDoctor?.leaveSlots || !selectedDoctor.availabilitySlots) return [];

    return selectedDoctor.leaveSlots
      .filter(leaveSlot => {
        const leaveDate = parse(leaveSlot.date, 'yyyy-MM-dd', new Date());
        const dayName = daysOfWeek[getDay(leaveDate)];
        
        const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayName);
        if (!availabilityForDay) return false;
        
        const totalSlotsForDay = availabilityForDay.timeSlots.length;
        const leaveSlotsCount = leaveSlot.slots.length;
        
        return leaveSlotsCount >= totalSlotsForDay;
      })
      .map(ls => parse(ls.date, 'yyyy-MM-dd', new Date()));
  }, [selectedDoctor?.leaveSlots, selectedDoctor?.availabilitySlots]);


  const timeSlots = useMemo(() => {
    if (!selectedDate || !selectedDoctor || !selectedDoctor.averageConsultingTime) {
      return [];
    }

    const dayOfWeek = daysOfWeek[getDay(selectedDate)];
    const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);
    if (!availabilityForDay) return [];
    
    const formattedDate = format(selectedDate, "d MMMM yyyy");
    const otherAppointments = appointments.filter(apt => !(isEditing && apt.id === editingAppointment?.id));
    const bookedSlotsForDay = otherAppointments
      .filter(apt => apt.doctor === selectedDoctor.name && apt.date === formattedDate)
      .map(apt => apt.time);

    const slots: { time: string; disabled: boolean }[] = [];
    const avgTime = selectedDoctor.averageConsultingTime;
    
    const leaveForDate = selectedDoctor.leaveSlots?.find(ls => isSameDay(parse(ls.date, 'yyyy-MM-dd', new Date()), selectedDate));
    const leaveTimeSlots = leaveForDate ? leaveForDate.slots : [];

    availabilityForDay.timeSlots.forEach(ts => {
      let currentTime = parseDateFns(ts.from, 'hh:mm a', selectedDate);
      const endTime = parseDateFns(ts.to, 'hh:mm a', selectedDate);

      while (currentTime < endTime) {
        const slotTime = format(currentTime, "hh:mm a");
        
        const isLeave = leaveTimeSlots.some(leaveSlot => {
           const leaveStart = parseDateFns(leaveSlot.from, 'hh:mm a', selectedDate);
           const leaveEnd = parseDateFns(leaveSlot.to, 'hh:mm a', selectedDate);
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
  }, [selectedDate, selectedDoctor, appointments, isEditing, editingAppointment]);
  
  const isAppointmentOnLeave = (appointment: Appointment): boolean => {
      if (!doctors.length || !appointment) return false;
      
      const doctorForApt = doctors.find(d => d.name === appointment.doctor);
      if (!doctorForApt || !doctorForApt.leaveSlots) return false;
      
      const aptDate = parse(appointment.date, "d MMMM yyyy", new Date());
      const leaveForDay = doctorForApt.leaveSlots.find(ls => isSameDay(parse(ls.date, "yyyy-MM-dd", new Date()), aptDate));
      
      if (!leaveForDay) return false;

      const aptTime = parseDateFns(appointment.time, "hh:mm a", new Date(0));
      
      return leaveForDay.slots.some(leaveSlot => {
          const leaveStart = parseDateFns(leaveSlot.from, "hh:mm a", new Date(0));
          const leaveEnd = parseDateFns(leaveSlot.to, "hh:mm a", new Date(0));
          return aptTime >= leaveStart && aptTime < leaveEnd;
      });
  };

  const filteredAppointments = useMemo(() => {
    const searchTermLower = drawerSearchTerm.toLowerCase();
    
    let filtered = appointments;

    if (filterAvailableDoctors) {
        const availableDoctorNames = doctors
            .filter(d => d.availability === 'Available')
            .map(d => d.name);
        filtered = filtered.filter(apt => availableDoctorNames.includes(apt.doctor));
    }

    if (searchTermLower) {
      filtered = filtered.filter(apt =>
        apt.patientName.toLowerCase().includes(searchTermLower) ||
        apt.doctor.toLowerCase().includes(searchTermLower) ||
        apt.department.toLowerCase().includes(searchTermLower)
      );
    }
    
    if (activeTab === 'upcoming') {
        filtered = filtered.filter(apt => {
            try {
                const aptDate = parse(apt.date, 'd MMMM yyyy', new Date());
                return (apt.status === 'Confirmed' || apt.status === 'Pending') && (isFuture(aptDate) || isToday(aptDate));
            } catch(e) { return false; }
        });
    } else if (activeTab === 'completed') {
        filtered = filtered.filter(apt => {
            try {
                const aptDate = parse(apt.date, 'd MMMM yyyy', new Date());
                return apt.status === 'Confirmed' && isPast(aptDate) && !isToday(aptDate);
            } catch(e) { return false; }
        });
    }

    return filtered.sort((a,b) => {
        try {
            const dateA = new Date(`${a.date} ${a.time}`).getTime();
            const dateB = new Date(`${b.date} ${b.time}`).getTime();
            return dateA - dateB;
        } catch(e) { return 0; }
    });
  }, [appointments, drawerSearchTerm, filterAvailableDoctors, doctors, activeTab]);


  return (
    <>
      <header className="flex h-14 items-center gap-4 border-b bg-background px-4 sm:px-6">
        <h1 className="text-xl font-semibold md:text-2xl">Appointments</h1>
      </header>
      <div className="flex-1 p-6">
        <div className="flex items-stretch gap-4">
          <main
            onClick={() => {
              if (isDrawerExpanded) {
                setIsDrawerExpanded(false);
              }
            }}
            className={cn(
              "relative flex-shrink-0 transition-all duration-300 ease-in-out h-[calc(100vh-7rem)]",
              isDrawerExpanded ? "w-3/12" : "w-2/3"
            )}
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle>{isEditing ? "Reschedule Appointment" : "Book New Appointment"}</CardTitle>
                <CardDescription>
                  {isEditing ? "Update the details for this appointment." : "Fill in the details below to book a new appointment."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className={cn("grid grid-cols-1 gap-x-8 gap-y-4", !isDrawerExpanded && "md:grid-cols-3")}>
                      <div className="space-y-4 md:col-span-1">
                        <h3 className="text-lg font-medium border-b pb-2">Patient Details</h3>
                        
                        <Tabs value={bookingType} onValueChange={handleBookingTypeChange} className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="existing">Existing Patient</TabsTrigger>
                                <TabsTrigger value="new">New Patient</TabsTrigger>
                            </TabsList>
                            <TabsContent value="existing" className="space-y-4 pt-4">
                                <FormItem>
                                    <FormLabel>Search Patient by Phone</FormLabel>
                                    <Popover open={isPatientPopoverOpen} onOpenChange={setIsPatientPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                        <Input
                                            ref={patientInputRef}
                                            placeholder="Start typing phone number..."
                                            value={patientSearchTerm}
                                            onChange={handlePatientNameChange}
                                        />
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                        <Command>
                                        <CommandList>
                                            <CommandEmpty>No patient found.</CommandEmpty>
                                            <CommandGroup>
                                            {patientSearchResults.map((patient) => (
                                                <CommandItem
                                                key={patient.id}
                                                value={patient.name}
                                                onSelect={() => handlePatientSelect(patient)}
                                                >
                                                {patient.name}
                                                <span className="text-xs text-muted-foreground ml-2">{patient.phone}</span>
                                                </CommandItem>
                                            ))}
                                            </CommandGroup>
                                        </CommandList>
                                        </Command>
                                    </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                                 {form.getValues("patientName") && bookingType === 'existing' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormItem>
                                            <FormLabel>Name</FormLabel>
                                            <FormControl><Input readOnly {...form.register("patientName")} /></FormControl>
                                        </FormItem>
                                        <FormItem>
                                            <FormLabel>Age</FormLabel>
                                            <FormControl><Input readOnly {...form.register("age")} /></FormControl>
                                        </FormItem>
                                        <FormItem>
                                            <FormLabel>Gender</FormLabel>
                                            <FormControl><Input readOnly {...form.register("gender")} /></FormControl>
                                        </FormItem>
                                        <FormItem>
                                            <FormLabel>Place</FormLabel>
                                            <FormControl><Input readOnly {...form.register("place")} /></FormControl>
                                        </FormItem>
                                    </div>
                                )}
                            </TabsContent>
                            <TabsContent value="new" className="space-y-4 pt-4">
                                <FormField control={form.control} name="patientName" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Patient Name</FormLabel>
                                        <FormControl><Input placeholder="Full Name" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="age" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Age</FormLabel>
                                        <FormControl><Input type="number" placeholder="35" {...field} value={field.value || ''} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="gender" render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel>Gender</FormLabel>
                                        <FormControl>
                                        <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-4">
                                            <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl><RadioGroupItem value="Male" /></FormControl>
                                            <FormLabel className="font-normal">Male</FormLabel>
                                            </FormItem>
                                            <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl><RadioGroupItem value="Female" /></FormControl>
                                            <FormLabel className="font-normal">Female</FormLabel>
                                            </FormItem>
                                        </RadioGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="phone" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Phone Number</FormLabel>
                                        <FormControl><Input placeholder="123-456-7890" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="place" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Place</FormLabel>
                                        <FormControl><Input placeholder="New York, USA" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </TabsContent>
                        </Tabs>

                        <FormField control={form.control} name="bookedVia" render={({ field }) => (
                            <FormItem className="space-y-3">
                                <FormLabel>Booked Via</FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-4">
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl><RadioGroupItem value="Phone" /></FormControl>
                                            <FormLabel className="font-normal">Phone</FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-2 space-y-0">
                                            <FormControl><RadioGroupItem value="Walk-in" /></FormControl>
                                            <FormLabel className="font-normal">Walk-in</FormLabel>
                                        </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )} />
                      </div>
                      
                      {!isDrawerExpanded && (
                      <>
                          <div className="space-y-4 md:col-span-1">
                              <h3 className="text-lg font-medium border-b pb-2">Select Date</h3>
                            <FormField control={form.control} name="date" render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <Calendar
                                    className="bg-primary text-primary-foreground rounded-md [&_button:hover]:bg-primary/80 [&_.rdp-day_today]:bg-primary-foreground/20 [&_button]:text-primary-foreground"
                                    mode="single" selected={field.value} onSelect={field.onChange}
                                    disabled={(date) => 
                                        date < new Date(new Date().setHours(0,0,0,0)) || 
                                        !selectedDoctor ||
                                        !availableDaysOfWeek.includes(getDay(date)) ||
                                        leaveDates.some(leaveDate => isSameDay(date, leaveDate))
                                    }
                                    initialFocus
                                    compact={false}
                                    modifiers={{ 
                                        available: selectedDoctor ? { dayOfWeek: availableDaysOfWeek } : {},
                                        leave: leaveDates,
                                    }}
                                    modifiersStyles={{
                                        available: { backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' },
                                        leave: { backgroundColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' },
                                    }}
                                    />
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                          </div>

                          <div className="space-y-4 md:col-span-1">
                              <h3 className="text-lg font-medium border-b pb-2">Appointment Details</h3>
                              <div className="space-y-4">
                              <FormField control={form.control} name="doctor" render={({ field }) => (
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
                                          <SelectItem key={doc.id} value={doc.id}>{doc.name} - {doc.specialty}</SelectItem>
                                          ))}
                                      </SelectContent>
                                      </Select>
                                      <FormMessage />
                                  </FormItem>
                                  )}
                              />
                                                        </div>

                          {selectedDoctor && selectedDate && (
                              <FormField control={form.control} name="time" render={({ field }) => (
                                  <FormItem>
                                  <FormLabel>Select Time Slot</FormLabel>
                                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
                                      {timeSlots.length > 0 ? timeSlots.map(slot => (
                                      <Button
                                          key={slot.time} type="button"
                                          variant={field.value === format(parseDateFns(slot.time, "hh:mm a", new Date()), 'HH:mm') ? "default" : "outline"}
                                          onClick={() => field.onChange(format(parseDateFns(slot.time, "hh:mm a", new Date()), 'HH:mm'))}
                                          disabled={slot.disabled}
                                          className={cn("text-xs", slot.disabled && "line-through")}
                                      >{slot.time}</Button>
                                      )) : <p className="text-sm text-muted-foreground col-span-2">No available slots for this day.</p>}
                                  </div>
                                  <FormMessage />
                                  </FormItem>
                              )}
                              />
                          )}
                          </div>
                      </>
                      )}
                    </div>
                    <div className="flex justify-end items-center pt-4">
                      <div className="flex justify-end gap-2">
                          {isEditing && <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>}
                          <Button type="submit">{isEditing ? "Save Changes" : "Book Appointment"}</Button>
                      </div>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </main>
          <div className="flex h-full items-center justify-center z-20">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setIsDrawerExpanded(!isDrawerExpanded);
              }}
            >
              {isDrawerExpanded ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </Button>
          </div>
          <aside className={cn(
              "relative flex-shrink-0 transition-all duration-300 ease-in-out h-[calc(100vh-7rem)]",
              isDrawerExpanded ? "w-8/12 pr-6" : "w-[26.666667%] mr-6"
          )}>
            <Card className="h-full rounded-2xl">
              <CardHeader className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle>Appointment Details</CardTitle>
                  </div>
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList>
                      <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                      <TabsTrigger value="completed">Completed</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search by patient, doctor, department..."
                      className="w-full rounded-lg bg-background pl-8 h-9"
                      value={drawerSearchTerm}
                      onChange={(e) => setDrawerSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button variant={filterAvailableDoctors ? "default" : "outline"} size="icon" onClick={() => setFilterAvailableDoctors(prev => !prev)}>
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <Printer className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon">
                    <FileDown className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-19rem)]">
                  {loading ? (
                    <div className="p-6">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="p-3 rounded-lg border bg-muted animate-pulse h-20 mb-3"></div>
                      ))}
                    </div>
                  ) : isDrawerExpanded ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Age</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Place</TableHead>
                          <TableHead>Doctor</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Booked Via</TableHead>
                          <TableHead>Token</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAppointments.map((appointment, index) => (
                          <TableRow key={appointment.id ? `${appointment.id}-${appointment.tokenNumber}` : `${Date.now()}-${index}`} className={cn(isAppointmentOnLeave(appointment) && "bg-red-100 dark:bg-red-900/30")}>
                            <TableCell className="font-medium">{appointment.patientName}</TableCell>
                            <TableCell>{appointment.age}</TableCell>
                            <TableCell>{appointment.gender}</TableCell>
                            <TableCell>{appointment.phone}</TableCell>
                            <TableCell>{appointment.place}</TableCell>
                            <TableCell>{appointment.doctor}</TableCell>
                            <TableCell>{appointment.department}</TableCell>
                            <TableCell>{format(parse(appointment.date, "d MMMM yyyy", new Date()), "MMM d, yy")}</TableCell>
                            <TableCell>{appointment.time}</TableCell>
                            <TableCell>{appointment.bookedVia}</TableCell>
                            <TableCell>{appointment.tokenNumber}</TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setEditingAppointment(appointment)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-red-600">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Appointment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAppointments
                          .map((appointment, index) => (
                          <TableRow key={appointment.id ? `${appointment.id}-${appointment.tokenNumber}` : `${Date.now()}-${index}`} className={cn(isAppointmentOnLeave(appointment) && "bg-red-100 dark:bg-red-900/30")}>
                            <TableCell>
                              <div className="font-medium">{appointment.patientName}</div>
                              <div className="text-xs text-muted-foreground">with {appointment.doctor}</div>
                            </TableCell>
                            <TableCell>
                              <div>{appointment.date}</div>
                              <div className="text-xs text-muted-foreground">{appointment.time}</div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  appointment.status === "Confirmed" ? "success"
                                  : appointment.status === "Pending" ? "warning"
                                  : "destructive"
                                }
                              >{appointment.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="link" size="sm" className="p-0 h-auto text-primary" onClick={() => {
                                setEditingAppointment(appointment);
                              }}>
                                Reschedule
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
        <WeeklyDoctorAvailability />
    </>
  );
}

    

    