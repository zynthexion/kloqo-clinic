
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
import { parse, isSameDay, parse as parseDateFns, format, getDay } from "date-fns";
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
import { ChevronRight } from "lucide-react";
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
  time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s(AM|PM)$/, "Invalid time format"),
  department: z.string().min(1, { message: "Please select a department." }),
  status: z.enum(["Confirmed", "Pending", "Cancelled"]),
  treatment: z.string().min(2, { message: "Treatment must be at least 2 characters." }),
  bookedVia: z.enum(["Online", "Phone", "Walk-in"]),
  place: z.string().min(2, { message: "Place must be at least 2 characters." }),
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[]>([]);
  const [isPatientPopoverOpen, setIsPatientPopoverOpen] = useState(false);
  const [isNewPatient, setIsNewPatient] = useState(false);

  const { toast } = useToast();

  const isEditing = !!editingAppointment;

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
  
  useEffect(() => {
    if (patientSearchTerm.length > 1) {
      const results = allPatients.filter(p =>
        p.name.toLowerCase().includes(patientSearchTerm.toLowerCase())
      );
      setPatientSearchResults(results);
      setIsPatientPopoverOpen(true);
      setIsNewPatient(results.length === 0);
    } else {
      setPatientSearchResults([]);
      setIsPatientPopoverOpen(false);
      setIsNewPatient(false);
    }
  }, [patientSearchTerm, allPatients]);


  useEffect(() => {
    const fetchAppointmentsAndPatients = async () => {
      try {
        const appointmentsCollection = collection(db, "appointments");
        const appointmentsSnapshot = await getDocs(appointmentsCollection);
        const appointmentsList = appointmentsSnapshot.docs.map(doc => ({ ...doc.data() } as Appointment));
        setAppointments(appointmentsList);

        const patientMap = new Map<string, Patient>();
        appointmentsList.forEach((apt) => {
          if (!apt.patientName || !apt.phone) return;
          const patientId = encodeURIComponent(`${apt.patientName}-${apt.phone}`);
          
          if (!apt.date) return;

          const appointmentDate = parse(apt.date, 'd MMMM yyyy', new Date());

          if (patientMap.has(patientId)) {
            const existingPatient = patientMap.get(patientId)!;
            
            let lastVisitDate = existingPatient.lastVisit;
            try {
                const existingDate = parse(existingPatient.lastVisit, 'd MMMM yyyy', new Date());
                if (appointmentDate > existingDate) {
                    lastVisitDate = apt.date;
                }
            } catch (e) {
                lastVisitDate = apt.date;
            }

            patientMap.set(patientId, {
              ...existingPatient,
              lastVisit: lastVisitDate,
              totalAppointments: existingPatient.totalAppointments + 1,
            });
          } else {
            patientMap.set(patientId, {
              id: patientId,
              name: apt.patientName,
              age: apt.age,
              gender: apt.gender,
              phone: apt.phone,
              place: apt.place,
              lastVisit: apt.date,
              doctor: apt.doctor,
              totalAppointments: 1
            });
          }
        });
        setAllPatients(Array.from(patientMap.values()));

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    const fetchDoctors = async () => {
      const doctorsCollection = collection(db, "doctors");
      const doctorsSnapshot = await getDocs(doctorsCollection);
      const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
      setDoctors(doctorsList);
    };

    fetchAppointmentsAndPatients();
    fetchDoctors();
  }, []);

  const resetForm = () => {
    setEditingAppointment(null);
    setSelectedDoctorId(null);
    setPatientSearchTerm("");
    setIsNewPatient(false);
    form.reset({
      patientName: "", gender: "Male", phone: "", age: 0, doctor: "",
      date: undefined, time: undefined, department: "", treatment: "",
      place: "", status: "Pending", bookedVia: "Online",
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
            });
            setPatientSearchTerm(editingAppointment.patientName);
            setSelectedDoctorId(doctor.id);
            setIsNewPatient(false);
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
        
        const dataToSave = {
            ...values,
            date: format(values.date, "d MMMM yyyy"),
            doctor: doctorName,
        };

        if (isEditing) {
            const { id, ...restOfData } = dataToSave;
            if (!id) throw new Error("Editing an appointment without an ID.");
            const appointmentRef = doc(db, "appointments", id);
            await setDoc(appointmentRef, restOfData, { merge: true });

            setAppointments(prev => {
                return prev.map(apt => apt.id === id ? { ...apt, ...restOfData } : apt);
            });
            toast({
                title: "Appointment Rescheduled",
                description: `Appointment for ${restOfData.patientName} has been updated.`,
            });
        } else {
            const appointmentId = `APT-${Date.now()}`;
            let prefix = '';
            if (values.bookedVia === 'Online') prefix = 'A';
            else if (values.bookedVia === 'Phone') prefix = 'P';
            else if (values.bookedVia === 'Walk-in') prefix = 'W';
            const tokenNumber = `${prefix}${(appointments.length + 1).toString().padStart(3, '0')}`;
            
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
        form.setValue("department", doctor.department || "");
        form.setValue("date", undefined, { shouldValidate: true });
        form.setValue("time", undefined, { shouldValidate: true });
    } else {
        form.setValue("department", "");
    }
  }

  const handlePatientSelect = (patient: Patient) => {
    form.setValue("patientName", patient.name);
    form.setValue("age", patient.age);
    form.setValue("gender", patient.gender);
    form.setValue("phone", patient.phone);
    form.setValue("place", patient.place || "");
    setPatientSearchTerm(patient.name);
    setIsPatientPopoverOpen(false);
    setIsNewPatient(false);
  }

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
        if (!availabilityForDay) return false; // Not a working day anyway
        
        const totalSlotsForDay = availabilityForDay.timeSlots.length;
        const leaveSlotsCount = leaveSlot.slots.length;
        
        // Mark as a full leave day only if all slots are on leave
        return leaveSlotsCount >= totalSlotsForDay;
      })
      .map(ls => parse(ls.date, 'yyyy-MM-dd', new Date()));
  }, [selectedDoctor?.leaveSlots, selectedDoctor?.availabilitySlots]);


  const timeSlots = useMemo(() => {
    if (!selectedDate || !selectedDoctor || !selectedDoctor.availabilitySlots || !selectedDoctor.averageConsultingTime) {
      return [];
    }

    const dayOfWeek = daysOfWeek[getDay(selectedDate)];
    const availabilityForDay = selectedDoctor.availabilitySlots.find(s => s.day === dayOfWeek);
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
      let currentTime = parseDateFns(ts.from, 'HH:mm', selectedDate);
      const endTime = parseDateFns(ts.to, 'HH:mm', selectedDate);

      while (currentTime < endTime) {
        const slotTime = format(currentTime, "hh:mm a");
        
        const isLeave = leaveTimeSlots.some(leaveSlot => {
           const leaveStart = parseDateFns(leaveSlot.from, 'HH:mm', selectedDate);
           const leaveEnd = parseDateFns(leaveSlot.to, 'HH:mm', selectedDate);
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
          const leaveStart = parseDateFns(leaveSlot.from, "HH:mm", new Date(0));
          const leaveEnd = parseDateFns(leaveSlot.to, "HH:mm", new Date(0));
          return aptTime >= leaveStart && aptTime < leaveEnd;
      });
  };

  const handlePatientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPatientSearchTerm(value);
    form.setValue("patientName", value);
  };
  
  const handlePopoverOpenChange = (open: boolean) => {
    setIsPatientPopoverOpen(open);
    if (!open) {
      // When popover closes, ensure the form value is set to whatever is in the input
      form.setValue("patientName", patientSearchTerm);
    }
  };

  return (
    <>
      <header className="flex h-14 items-center gap-4 border-b bg-background px-4 sm:px-6">
        <h1 className="text-xl font-semibold md:text-2xl">Appointments</h1>
      </header>
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex flex-1 p-6 gap-6">
            <main className={cn("flex-shrink-0 overflow-auto transition-all duration-300 ease-in-out pr-6", isDrawerOpen ? 'w-2/3' : 'w-full')}>
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
                          <div className="space-y-4 md:col-span-1">
                            <h3 className="text-lg font-medium border-b pb-2">Patient Details</h3>
                            
                             <FormField
                                control={form.control}
                                name="patientName"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Patient Name</FormLabel>
                                     <Popover open={isPatientPopoverOpen} onOpenChange={handlePopoverOpenChange}>
                                        <PopoverTrigger asChild>
                                        <FormControl>
                                            <Input
                                                placeholder="Start typing patient name..."
                                                value={patientSearchTerm}
                                                onChange={handlePatientNameChange}
                                                onBlur={() => {
                                                    // This ensures that if the user clicks away, the form value is set.
                                                    field.onChange(patientSearchTerm);
                                                }}
                                            />
                                        </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search patient..." value={patientSearchTerm} onValueChange={setPatientSearchTerm} />
                                            <CommandList>
                                                <CommandEmpty>
                                                    <div className="p-4 text-sm">
                                                        New Patient: "{patientSearchTerm}"
                                                    </div>
                                                </CommandEmpty>
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
                                )}
                            />

                            {patientSearchTerm && (
                                <div className={`text-sm px-3 py-1 rounded ${
                                    isNewPatient 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                    {isNewPatient ? '✓ New Patient' : '✓ Existing Patient'}
                                </div>
                            )}

                            <FormField control={form.control} name="age" render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Age</FormLabel>
                                  <FormControl><Input type="number" placeholder="35" {...field} value={field.value || ''} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
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
                              )}
                            />
                            <FormField control={form.control} name="phone" render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Phone Number</FormLabel>
                                  <FormControl><Input placeholder="123-456-7890" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                             <FormField control={form.control} name="place" render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Place</FormLabel>
                                  <FormControl><Input placeholder="New York, USA" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField control={form.control} name="treatment" render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Treatment</FormLabel>
                                  <FormControl><Input placeholder="e.g. Routine Check-up" {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                           <div className="space-y-4 md:col-span-1">
                             <h3 className="text-lg font-medium border-b pb-2">Select Date</h3>
                            <FormField control={form.control} name="date" render={({ field }) => (
                                <FormItem className="flex flex-col">
                                  <Calendar
                                    mode="single" selected={field.value} onSelect={field.onChange}
                                    disabled={(date) => 
                                        date < new Date(new Date().setHours(0,0,0,0)) || 
                                        !selectedDoctor ||
                                        !availableDaysOfWeek.includes(getDay(date)) ||
                                        leaveDates.some(leaveDate => isSameDay(date, leaveDate))
                                    }
                                    initialFocus
                                    compact={isDrawerOpen}
                                    modifiers={{ 
                                      available: selectedDoctor ? { dayOfWeek: availableDaysOfWeek } : {},
                                      leave: leaveDates,
                                    }}
                                    modifiersStyles={{
                                      available: { backgroundColor: '#D4EDDA', color: '#155724' },
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
                                          variant={field.value === slot.time ? "default" : "outline"}
                                          onClick={() => field.onChange(slot.time)}
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
            
            <aside className={cn(
                "flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden",
                isDrawerOpen ? 'w-1/3' : 'w-0'
            )}>
                <Card className="h-full rounded-2xl">
                    <CardHeader className="p-6 border-b">
                        <CardTitle>Upcoming Appointments</CardTitle>
                        <CardDescription>A list of all scheduled appointments.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[calc(100vh-19rem)]">
                            {loading ? (
                                <div className="p-6">
                                    {Array.from({ length: 10 }).map((_, i) => (
                                        <div key={i} className="p-3 rounded-lg border bg-muted animate-pulse h-20 mb-3"></div>
                                    ))}
                                </div>
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
                                        {appointments
                                            .sort((a,b) => new Date(`${a.date} ${a.time}`).getTime() - new Date(`${b.date} ${b.time}`).getTime())
                                            .map((appointment) => (
                                            <TableRow key={appointment.id} className={cn(isAppointmentOnLeave(appointment) && "bg-red-100 dark:bg-red-900/30")}>
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
                                                        setIsDrawerOpen(false);
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

         <div className="fixed right-6 top-1/2 -translate-y-1/2 z-20">
              <Button 
                className={cn("relative h-24 w-8 rounded-lg shadow-lg animate-wave", isDrawerOpen && "hidden")}
                size="icon" 
                onClick={() => setIsDrawerOpen(true)}
              >
                  <ChevronRight className="h-6 w-6 transition-transform duration-300 -rotate-180" />
              </Button>
          </div>
          <Button 
            className={cn("fixed top-1/2 -translate-y-1/2 h-24 w-8 rounded-lg shadow-lg animate-wave z-20", 
                         "transition-all duration-300 ease-in-out",
                         isDrawerOpen ? "right-[calc(33.33%-1rem)]" : "-right-10"
            )}
            size="icon" 
            onClick={() => setIsDrawerOpen(false)}
          >
              <ChevronRight className="h-6 w-6 transition-transform duration-300" />
          </Button>
          <WeeklyDoctorAvailability />
      </div>
    </>
  );
}
