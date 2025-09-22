
"use client";

import { useEffect, useState, useMemo } from "react";
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
import type { Appointment, Doctor } from "@/lib/types";
import { collection, getDocs, setDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { parse, isSameDay, parse as parseDateFns, format, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import { TopNav } from "@/components/layout/top-nav";
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
import { PlusCircle, ClipboardList } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";

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
  const [loading, setLoading] = useState(true);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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
    const fetchAppointments = async () => {
      try {
        const appointmentsCollection = collection(db, "appointments");
        const appointmentsSnapshot = await getDocs(appointmentsCollection);
        const appointmentsList = appointmentsSnapshot.docs.map(doc => ({ ...doc.data() } as Appointment));
        setAppointments(appointmentsList);

      } catch (error) {
        console.error("Error fetching appointments:", error);
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

    fetchAppointments();
    fetchDoctors();
  }, []);

  const resetForm = () => {
    setEditingAppointment(null);
    setSelectedDoctorId(null);
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
            form.reset({
                ...editingAppointment,
                date: parse(editingAppointment.date, "d MMMM yyyy", new Date()),
                doctor: doctor.id,
            });
            setSelectedDoctorId(doctor.id);
        }
    } else {
        resetForm();
    }
  }, [editingAppointment, form, doctors]);

  const selectedDoctor = useMemo(() => {
    return doctors.find(d => d.id === selectedDoctorId) || null;
  }, [doctors, selectedDoctorId]);

  const selectedDate = form.watch("date");

  const availableDoctorsForDate = useMemo(() => {
    if (!selectedDate) return doctors;
    const dayOfWeekIndex = getDay(selectedDate);
    const dayOfWeek = daysOfWeek[dayOfWeekIndex];

    return doctors.filter(doctor => {
        const isAvailableOnDay = doctor.availabilitySlots?.some(slot => slot.day === dayOfWeek);
        if (!isAvailableOnDay) return false;

        const isOnLeave = doctor.leaveSlots?.some(leave => 
            isSameDay(parse(leave.date, 'yyyy-MM-dd', new Date()), selectedDate)
        );
        if (isOnLeave) return false;
        
        return true;
    });
  }, [doctors, selectedDate]);

  useEffect(() => {
    if (selectedDate && selectedDoctorId) {
        const isDoctorAvailable = availableDoctorsForDate.some(d => d.id === selectedDoctorId);
        if (!isDoctorAvailable) {
            form.setValue("doctor", "");
            setSelectedDoctorId(null);
            form.setValue("department", "");
        }
    }
  }, [selectedDate, selectedDoctorId, availableDoctorsForDate, form]);

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
        form.setValue("time", undefined, { shouldValidate: true });
    } else {
        form.setValue("department", "");
    }
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
  
  const handleOpenReschedule = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    setIsDrawerOpen(false);
  }

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

  return (
    <div className="flex flex-col h-screen">
      <TopNav />
        <header className="sticky top-16 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:px-6">
          <h1 className="text-xl font-semibold md:text-2xl">Appointments</h1>
        </header>

        <main className="flex-1 p-6 overflow-auto">
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
                      {/* Patient Details Column */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium border-b pb-2">Patient Details</h3>
                        <FormField control={form.control} name="patientName" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Patient Name</FormLabel>
                              <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField control={form.control} name="age" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Age</FormLabel>
                              <FormControl><Input type="number" placeholder="35" {...field} /></FormControl>
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
                        <FormField control={form.control} name="treatment" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Treatment</FormLabel>
                              <FormControl><Input placeholder="e.g. Routine Check-up" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Calendar Column */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium border-b pb-2">Select Date</h3>
                        <FormField control={form.control} name="date" render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <Calendar
                                mode="single" selected={field.value} onSelect={field.onChange}
                                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) || (!!selectedDoctor && !availableDaysOfWeek.includes(getDay(date)))}
                                initialFocus
                                className="rounded-md border"
                                modifiers={{ 
                                  available: selectedDoctor ? { dayOfWeek: availableDaysOfWeek } : {},
                                  leave: leaveDates 
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
                      </div>
                      
                      {/* Appointment/Doctor Details Column */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium border-b pb-2">Appointment Details</h3>
                        <FormField control={form.control} name="doctor" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Doctor</FormLabel>
                              <Select onValueChange={onDoctorChange} value={field.value} disabled={!selectedDate}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={selectedDate ? "Select an available doctor" : "Select a date first"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {availableDoctorsForDate.map(doc => (
                                    <SelectItem key={doc.id} value={doc.id}>{doc.name} - {doc.specialty}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

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
                         <FormField control={form.control} name="status" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
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
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-4">
                        <div className="flex gap-2">
                             <Button onClick={resetForm} variant="outline">
                                <PlusCircle className="mr-2 h-4 w-4" />
                                New Appointment
                            </Button>
                        </div>
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
        
        <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
            <SheetTrigger asChild>
                <Button className="fixed right-6 bottom-6 h-16 w-16 rounded-full shadow-lg" size="icon">
                    <ClipboardList className="h-8 w-8" />
                </Button>
            </SheetTrigger>
            <SheetContent className="w-full md:w-1/2 p-0">
                <SheetHeader className="p-6 border-b">
                    <SheetTitle>Upcoming Appointments</SheetTitle>
                    <SheetDescription>A list of all scheduled appointments.</SheetDescription>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-80px)]">
                    <div className="p-6 space-y-3">
                        {loading ? (
                           Array.from({ length: 10 }).map((_, i) => (
                              <div key={i} className="p-3 rounded-lg border bg-muted animate-pulse h-20"></div>
                           ))
                        ) : (
                          appointments
                            .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                            .map((appointment) => (
                            <div key={appointment.id} className={cn("p-3 rounded-lg border", isAppointmentOnLeave(appointment) && "bg-red-100 dark:bg-red-900/30 border-red-300")}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold text-sm">{appointment.patientName}</p>
                                        <p className="text-xs text-muted-foreground">with {appointment.doctor}</p>
                                    </div>
                                    <Badge
                                      variant={
                                        appointment.status === "Confirmed" ? "success"
                                        : appointment.status === "Pending" ? "warning"
                                        : "destructive"
                                      }
                                    >{appointment.status}</Badge>
                                </div>
                                <div className="flex justify-between items-end mt-2">
                                     <div>
                                        <p className="text-xs text-muted-foreground">{appointment.date}</p>
                                        <p className="text-xs font-medium">{appointment.time}</p>
                                    </div>
                                    <Button variant="link" size="sm" className="p-0 h-auto text-primary" onClick={() => handleOpenReschedule(appointment)}>
                                        Reschedule
                                    </Button>
                                </div>
                            </div>
                          ))
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    </div>
  );
}
