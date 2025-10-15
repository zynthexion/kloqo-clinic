
"use client";

import { useEffect, useState, useMemo, useRef, useTransition, useCallback } from "react";
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
import type { Appointment, Doctor, Patient, Visit } from "@/lib/types";
import { collection, getDocs, setDoc, doc, query, where, getDoc as getFirestoreDoc, updateDoc, increment, arrayUnion, addDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { parse, isSameDay, parse as parseDateFns, format, getDay, isPast, isFuture, isToday, startOfYear, endOfYear } from "date-fns";
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
import { ChevronLeft, FileDown, Printer, Search, MoreHorizontal, Eye, Edit, Trash2, ChevronRight, Stethoscope, Phone, Footprints, Loader2, Link as LinkIcon, Crown, UserCheck, UserPlus, Users } from "lucide-react";
import { DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
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
import { useAuth } from "@/firebase";
import { useSearchParams } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddRelativeDialog } from "@/components/patients/add-relative-dialog";

const formSchema = z.object({
  id: z.string().optional(),
  patientName: z.string().min(2, { message: "Name must be at least 2 characters." }),
  sex: z.enum(["Male", "Female", "Other"]),
  phone: z.string().min(10, { message: "Phone number must be at least 10 digits." }),
  age: z.coerce.number().min(0, "Age cannot be negative."),
  doctor: z.string().min(1, { message: "Please select a doctor." }),
  department: z.string().min(1, { message: "Department is required." }),
  date: z.date({
    required_error: "A date is required."
  }),
  time: z.string().min(1, "Please select a time."),
  place: z.string().min(2, { message: "Place must be at least 2 characters." }),
  bookedVia: z.enum(["Phone", "Walk-in", "Online"]),
  tokenNumber: z.string().optional(),
  patientId: z.string().optional(),
});

type AppointmentFormValues = z.infer<typeof formSchema>;

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];


export default function AppointmentsPage() {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const drawerOpenParam = searchParams.get('drawer');

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(drawerOpenParam === 'open');

  const handleCancel = (appointment: Appointment) => {
    setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'Cancelled' } : a));
  };
  const handleComplete = async (appointment: Appointment) => {
    setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'Completed' } : a));
    if (appointment.id) {
        const appointmentRef = doc(db, "appointments", appointment.id);
        await setDoc(appointmentRef, { status: "Completed" }, { merge: true });
    }
  };
  const handleSkip = async (appointment: Appointment) => {
  setAppointments(prev => {
    const updated = prev.map(a => a.id === appointment.id ? { ...a, isSkipped: true } : a);
    return [
      ...updated.filter(a => !a.isSkipped),
      ...updated.filter(a => a.isSkipped)
    ];
  });
  if (appointment.id) {
    const appointmentRef = doc(db, "appointments", appointment.id);
    await setDoc(appointmentRef, { isSkipped: true }, { merge: true });
  }
};

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[]>([]);
  const [isPatientPopoverOpen, setIsPatientPopoverOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [primaryKloqoMember, setPrimaryKloqoMember] = useState<Patient | null>(null);
  const [isPending, startTransition] = useTransition();

  const [drawerSearchTerm, setDrawerSearchTerm] = useState("");
  const [filterAvailableDoctors, setFilterAvailableDoctors] = useState(false);
const [selectedDrawerDoctor, setSelectedDrawerDoctor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("upcoming");
const currentYearStart = startOfYear(new Date());
const currentYearEnd = endOfYear(new Date());
const [drawerDateRange, setDrawerDateRange] = useState<DateRange | undefined>({ from: currentYearStart, to: currentYearEnd });
  const [bookingFor, setBookingFor] = useState('member');
  const [relatives, setRelatives] = useState<Patient[]>([]);
  const [isAddRelativeDialogOpen, setIsAddRelativeDialogOpen] = useState(false);


  const { toast } = useToast();

  const isEditing = !!editingAppointment;

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientName: "",
      phone: "",
      age: 0,
      sex: "Male",
      doctor: "",
      date: undefined,
      time: undefined,
      place: "",
      bookedVia: "Phone",
    },
  });
  
  const patientInputRef = useRef<HTMLInputElement>(null);

  const searchPatients = useCallback(async (searchTerm: string) => {
    if (searchTerm.length < 10) {
      setPatientSearchResults([]);
      setIsPatientPopoverOpen(false);
      return;
    }
    const phoneNumber = `+91${searchTerm}`;
    const q = query(collection(db, "patients"), where("phone", "==", phoneNumber));
    const querySnapshot = await getDocs(q);
    const results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
    setPatientSearchResults(results);
    setIsPatientPopoverOpen(results.length > 0);
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      searchPatients(patientSearchTerm);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [patientSearchTerm, searchPatients]);


  useEffect(() => {
    const fetchInitialData = async () => {
      if (!auth.currentUser) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        
        const userDoc = await getFirestoreDoc(doc(db, "users", auth.currentUser.uid));
        const userClinicId = userDoc.data()?.clinicId;
        if (!userClinicId) {
          toast({ variant: "destructive", title: "Error", description: "No clinic associated with this user." });
          setLoading(false);
          return;
        }
        setClinicId(userClinicId);

        const appointmentsQuery = query(collection(db, "appointments"), where("clinicId", "==", userClinicId));
        const appointmentsSnapshot = await getDocs(appointmentsQuery);
        const appointmentsList = appointmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
        setAppointments(appointmentsList);
    
        const doctorsQuery = query(collection(db, "doctors"), where("clinicId", "==", userClinicId));
        const doctorsSnapshot = await getDocs(doctorsQuery);
        const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);
    
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load initial data. Please refresh the page.",
        });
      } finally {
        setLoading(false);
      }
    };

    if (auth.currentUser) {
      fetchInitialData();
    }
  }, [auth.currentUser, toast]);

  const resetForm = () => {
    setEditingAppointment(null);
    setSelectedDoctorId(null);
    setPatientSearchTerm("");
    setSelectedPatient(null);
    setPrimaryKloqoMember(null);
    form.reset({
      patientName: "", sex: "Male", phone: "", age: 0, doctor: "",
      department: "",
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

            const loadPatientForEditing = async () => {
              if (editingAppointment.patientId) {
                const patientDoc = await getFirestoreDoc(doc(db, "patients", editingAppointment.patientId));
                if (patientDoc.exists()) {
                    setSelectedPatient(patientDoc.data() as Patient);
                }
              }
            }
            loadPatientForEditing();

            form.reset({
                ...editingAppointment,
                date: isNaN(appointmentDate.getTime()) ? undefined : appointmentDate,
                doctor: doctor.id,
                time: format(parseDateFns(editingAppointment.time, "hh:mm a", new Date()), 'HH:mm'),
                bookedVia: (editingAppointment.bookedVia === "Phone" || editingAppointment.bookedVia === "Walk-in" || editingAppointment.bookedVia === "Online") ? editingAppointment.bookedVia : "Phone"
            });
            setPatientSearchTerm(editingAppointment.phone.replace('+91', ''));
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


  async function onSubmit(values: AppointmentFormValues) {
    if (!auth.currentUser || !clinicId) {
        toast({ variant: "destructive", title: "Not Authenticated", description: "You must be logged in to book an appointment."});
        return;
    }
    
    startTransition(async () => {
        try {
          let patientId = isEditing ? values.patientId : selectedPatient?.id;
          let patientDataForApt = selectedPatient;
          
          const isKloqoMember = selectedPatient && !selectedPatient.clinicIds?.includes(clinicId);

          if (!patientId || isKloqoMember) {
             const newPatientId = patientId || doc(collection(db, "patients")).id;
             const patientRef = doc(db, 'patients', newPatientId);

             const patientToSave: Patient = {
                  id: newPatientId,
                  name: values.patientName,
                  age: values.age,
                  sex: values.sex,
                  phone: `+91${values.phone}`,
                  place: values.place,
                  clinicIds: arrayUnion(clinicId),
                  ...(selectedPatient ? { visitHistory: selectedPatient.visitHistory || [], totalAppointments: selectedPatient.totalAppointments || 0 } : {visitHistory: [], totalAppointments: 0}),
                  createdAt: selectedPatient?.createdAt || new Date(),
                  updatedAt: new Date(),
             }
             await setDoc(patientRef, patientToSave, { merge: true });
             patientId = newPatientId;
             patientDataForApt = patientToSave;
          }

          if (!patientId || !patientDataForApt) {
             toast({ variant: "destructive", title: "Error", description: "Could not create or find patient." });
             return;
          }
          const patientRef = doc(db, 'patients', patientId);

          const doctorName = doctors.find(d => d.id === values.doctor)?.name || "Unknown Doctor";
          const appointmentDateStr = format(values.date, "d MMMM yyyy");
          const appointmentTimeStr = format(parseDateFns(values.time, "HH:mm", new Date()), "hh:mm a");

          const appointmentId = isEditing ? values.id! : doc(collection(db, "appointments")).id;
          const prefix = values.bookedVia === 'Phone' ? 'P' : values.bookedVia === 'Walk-in' ? 'W' : 'A';
          const tokenNumber = isEditing ? values.tokenNumber! : `${prefix}${(appointments.length + 1).toString().padStart(3, '0')}`;
          
          const dataToSave: Appointment = {
              ...values,
              phone: patientDataForApt.phone,
              patientName: patientDataForApt.name,
              id: appointmentId,
              patientId: patientId,
              date: appointmentDateStr,
              time: appointmentTimeStr,
              doctor: doctorName,
              status: isEditing ? "Confirmed" : "Pending",
              treatment: "General Consultation",
              clinicId,
              tokenNumber,
          };

          const appointmentRef = doc(db, "appointments", appointmentId);
          await setDoc(appointmentRef, dataToSave, { merge: true });

          if (!isEditing) {
            const newVisit: Visit = {
                appointmentId: appointmentId,
                date: appointmentDateStr,
                time: appointmentTimeStr,
                doctor: doctorName,
                department: values.department,
                status: "Pending",
                treatment: "General Consultation",
            };
             await updateDoc(patientRef, {
                visitHistory: arrayUnion(newVisit),
                totalAppointments: increment(1),
                updatedAt: new Date(),
            });
          }

          // Update doctor's booked slots
          const doctorRef = doc(db, "doctors", values.doctor);
          await updateDoc(doctorRef, {
              bookedSlots: arrayUnion({
                  date: appointmentDateStr,
                  time: appointmentTimeStr,
                  tokenNumber: tokenNumber
              })
          });

          if (isEditing) {
              setAppointments(prev => prev.map(apt => apt.id === appointmentId ? dataToSave : apt));
              toast({
                  title: "Appointment Rescheduled",
                  description: `Appointment for ${dataToSave.patientName} has been updated.`,
              });
          } else {
              setAppointments(prev => [...prev, dataToSave]);
              toast({
                  title: "Appointment Booked",
                  description: `Appointment for ${dataToSave.patientName} has been successfully booked.`,
              });
          }
          resetForm();
        } catch (error) {
          console.error("Error saving appointment: ", error);
          toast({
              variant: "destructive",
              title: "Error",
              description: "Failed to save appointment. Please try again.",
          });
        }
    });
  }

  const handleDelete = async (appointmentId: string) => {
    startTransition(async () => {
      try {
        await deleteDoc(doc(db, "appointments", appointmentId));
        setAppointments(prev => prev.filter(apt => apt.id !== appointmentId));
        toast({ title: "Success", description: "Appointment deleted successfully." });
      } catch (error) {
        console.error("Error deleting appointment: ", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to delete appointment." });
      }
    });
  };

  const onDoctorChange = (doctorId: string) => {
    form.setValue("doctor", doctorId);
    setSelectedDoctorId(doctorId);
    const doctor = doctors.find(d => d.id === doctorId);
    if (doctor) {
      form.setValue("department", doctor.department || "");
      form.setValue("date", undefined, { shouldValidate: true });
      form.setValue("time", "", { shouldValidate: true });
    }
}

  const handlePatientSelect = async (patient: Patient) => {
    setSelectedPatient(patient);
    setPrimaryKloqoMember(patient);
    setBookingFor('member');
    setRelatives([]);

    const isKloqoMember = !patient.clinicIds?.includes(clinicId!);

    if (isKloqoMember) {
        form.setValue("patientId", patient.id);
        form.setValue("phone", patient.phone.replace('+91', ''));
        // Don't fill PII for kloqo members initially
        if (patient.relatedPatientIds && patient.relatedPatientIds.length > 0) {
            const relativePromises = patient.relatedPatientIds.map(id => getFirestoreDoc(doc(db, 'patients', id)));
            const relativeDocs = await Promise.all(relativePromises);
            const fetchedRelatives = relativeDocs
                .filter(doc => doc.exists())
                .map(doc => ({ id: doc.id, ...doc.data() } as Patient));
            setRelatives(fetchedRelatives);
        }

    } else { // Existing patient in this clinic
        form.setValue("patientId", patient.id);
        form.setValue("patientName", patient.name);
        form.setValue("age", patient.age);
        form.setValue("sex", patient.sex);
        form.setValue("phone", patient.phone.replace('+91', ''));
        form.setValue("place", patient.place || "");
    }

    setPatientSearchTerm(patient.phone.replace('+91', ''));
    setIsPatientPopoverOpen(false);
  }

  const handleRelativeSelect = (relative: Patient) => {
    setBookingFor('relative');
    setSelectedPatient(relative);
    form.setValue("patientId", relative.id);
    form.setValue("patientName", relative.name);
    form.setValue("age", relative.age);
    form.setValue("sex", relative.sex);
    form.setValue("phone", relative.phone.replace('+91', ''));
    form.setValue("place", relative.place || "");
    toast({ title: `Selected Relative: ${relative.name}`, description: "You are now booking an appointment for the selected relative."})
  }

  const handleNewRelativeAdded = (newRelative: Patient) => {
    setRelatives(prev => [...prev, newRelative]);
    handleRelativeSelect(newRelative);
  };


  const handlePatientSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (selectedPatient && value !== selectedPatient.phone.replace('+91', '')) {
      setSelectedPatient(null);
      setPrimaryKloqoMember(null);
      setRelatives([]);
      form.reset({
        ...form.getValues(),
        patientId: undefined,
        patientName: "",
        age: 0,
        sex: "Male",
        place: "",
      });
    }
    setPatientSearchTerm(value);
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
        if (!leaveSlot.date) return false;
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
    
    const leaveForDate = selectedDoctor.leaveSlots?.find(ls => ls.date && isSameDay(parse(ls.date, 'yyyy-MM-dd', new Date()), selectedDate));
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

        currentTime = new Date(currentTime.getTime() + avgTime * 60000);
      }
    });

    return slots;
  }, [selectedDate, selectedDoctor, appointments, isEditing, editingAppointment]);
  
  const isAppointmentOnLeave = (appointment: Appointment): boolean => {
      if (!doctors.length || !appointment) return false;
      
      const doctorForApt = doctors.find(d => d.name === appointment.doctor);
      if (!doctorForApt || !doctorForApt.leaveSlots) return false;
      
      const aptDate = parse(appointment.date, "d MMMM yyyy", new Date());
      const leaveForDay = doctorForApt.leaveSlots.find(ls => ls.date && isSameDay(parse(ls.date, "yyyy-MM-dd", new Date()), aptDate));
      
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

    if (drawerDateRange && (drawerDateRange.from || drawerDateRange.to)) {
      filtered = filtered.filter(apt => {
        try {
          const aptDate = parse(apt.date, 'd MMMM yyyy', new Date());
          const from = drawerDateRange.from ? new Date(drawerDateRange.from.setHours(0,0,0,0)) : null;
          const to = drawerDateRange.to ? new Date(drawerDateRange.to.setHours(23,59,59,999)) : null;
          if (from && to) return aptDate >= from && aptDate <= to;
          if (from) return aptDate >= from;
          if (to) return aptDate <= to;
          return true;
        } catch {
          return true;
        }
      });
    }

    if (selectedDrawerDoctor && selectedDrawerDoctor !== 'all') {
  filtered = filtered.filter(apt => apt.doctor === selectedDrawerDoctor);
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
  filtered = filtered.filter(apt => apt.status === 'Completed');
} else if (activeTab !== 'all') { // For other statuses like 'cancelled' etc.
    filtered = filtered.filter(apt => apt.status.toLowerCase() === activeTab);
}


    return filtered.sort((a,b) => {
        try {
            const dateA = new Date(`${a.date} ${a.time}`).getTime();
            const dateB = new Date(`${b.date} ${b.time}`).getTime();
            return dateA - dateB;
        } catch(e) { return 0; }
    });
  }, [appointments, drawerSearchTerm, filterAvailableDoctors, doctors, activeTab, drawerDateRange, selectedDrawerDoctor]);

  const today = format(new Date(), "d MMMM yyyy");
  const todaysAppointments = filteredAppointments.filter(apt => apt.date === today);

  const isNewPatient = patientSearchTerm.length >= 10 && !selectedPatient;
  const isKloqoMember = primaryKloqoMember && !primaryKloqoMember.clinicIds?.includes(clinicId!);

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
                    <div className="space-y-4">
                        <FormItem>
                            <FormLabel>Search Patient by Phone</FormLabel>
                            <Popover open={isPatientPopoverOpen} onOpenChange={setIsPatientPopoverOpen}>
                            <PopoverTrigger asChild>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <FormControl>
                                    <Input
                                        ref={patientInputRef}
                                        placeholder="Start typing 10-digit phone number..."
                                        value={patientSearchTerm}
                                        onChange={handlePatientSearchChange}
                                        className="pl-8"
                                        maxLength={10}
                                    />
                                    </FormControl>
                                </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                <Command>
                                <CommandList>
                                    <CommandEmpty>No patient found.</CommandEmpty>
                                    <CommandGroup>
                                    {patientSearchResults.map((patient) => {
                                        const isClinicPatient = patient.clinicIds?.includes(clinicId!);
                                        return (
                                        <CommandItem
                                            key={patient.id}
                                            value={patient.phone}
                                            onSelect={() => handlePatientSelect(patient)}
                                            className="flex justify-between items-center"
                                        >
                                          <div>
                                            {isClinicPatient ? (
                                                <>
                                                    {patient.name}
                                                    <span className="text-xs text-muted-foreground ml-2">{patient.phone}</span>
                                                </>
                                            ) : (
                                                <>
                                                    {patient.name.substring(0, 2)}***
                                                    <span className="text-xs text-muted-foreground ml-2">{patient.place}</span>
                                                </>
                                            )}
                                          </div>
                                          <Badge variant={isClinicPatient ? "secondary" : "outline"} className={cn(
                                            isClinicPatient ? "text-blue-600 border-blue-500" : "text-amber-600 border-amber-500"
                                          )}>
                                            {isClinicPatient ? (
                                                <UserCheck className="mr-1.5 h-3 w-3"/>
                                            ) : (
                                                <Crown className="mr-1.5 h-3 w-3" />
                                            )}
                                            {isClinicPatient ? "Existing Patient" : "Kloqo Member"}
                                          </Badge>
                                        </CommandItem>
                                    )})}
                                    </CommandGroup>
                                </CommandList>
                                </Command>
                            </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                         <div className="flex justify-end">
                            <Button type="button" variant="secondary" disabled={!patientSearchTerm || patientSearchResults.length > 0}>
                                <LinkIcon className="mr-2 h-4 w-4" />
                                Send Booking Link
                            </Button>
                        </div>
                    </div>
                    {(selectedPatient || isNewPatient || isEditing) && (
                      <div className="pt-4 border-t">
                        {isKloqoMember && !isEditing ? (
                          <Tabs value={bookingFor} onValueChange={setBookingFor}>
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="member">For Member</TabsTrigger>
                                <TabsTrigger value="relative">For a Relative</TabsTrigger>
                            </TabsList>
                            <TabsContent value="member" className="mt-4">
                               <div className="text-sm p-4 bg-muted/50 rounded-lg">
                                  <p><strong>Name:</strong> {primaryKloqoMember!.name.substring(0,2)}***</p>
                                  <p><strong>Place:</strong> {primaryKloqoMember!.place}</p>
                               </div>
                            </TabsContent>
                            <TabsContent value="relative">
                               <Card>
                                  <CardHeader>
                                    <CardTitle className="text-base">Relatives</CardTitle>
                                    <CardDescription className="text-xs">Book for an existing relative or add a new one.</CardDescription>
                                  </CardHeader>
                                  <CardContent className="space-y-3">
                                      {relatives.length > 0 ? (
                                        <ScrollArea className="h-40">
                                            {relatives.map(relative => (
                                                <div key={relative.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarFallback>{relative.name.charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <p className="text-sm font-medium">{relative.name}</p>
                                                            <p className="text-xs text-muted-foreground">{relative.sex}, {relative.age} years</p>
                                                        </div>
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={() => handleRelativeSelect(relative)}>Book</Button>
                                                </div>
                                            ))}
                                        </ScrollArea>
                                      ) : (
                                        <p className="text-center text-xs text-muted-foreground py-4">No relatives found.</p>
                                      )}
                                      <Button type="button" className="w-full" variant="outline" onClick={() => setIsAddRelativeDialogOpen(true)}>
                                        <UserPlus className="mr-2 h-4 w-4" />
                                        Add New Relative
                                      </Button>
                                  </CardContent>
                               </Card>
                            </TabsContent>
                          </Tabs>
                        ) : null}

                        <div className={cn("grid grid-cols-1 gap-x-8 gap-y-4 mt-4", !isDrawerExpanded && "md:grid-cols-3")}>
                          <div className="space-y-4 md:col-span-1">
                            <h3 className="text-lg font-medium border-b pb-2 flex items-center justify-between">
                                Patient Details
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField control={form.control} name="patientName" render={({ field }) => (
                                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} disabled={!isNewPatient && !isEditing && (!isKloqoMember || (isKloqoMember && bookingFor === 'member'))} value={(isKloqoMember && !isEditing && bookingFor === 'member') ? `${field.value.substring(0,2)}***` : field.value} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="age" render={({ field }) => (
                                    <FormItem><FormLabel>Age</FormLabel><FormControl><Input type="number" {...field} disabled={!isNewPatient && !isEditing && (!isKloqoMember || (isKloqoMember && bookingFor === 'member'))} value={(isKloqoMember && !isEditing && bookingFor === 'member') ? '**' : field.value}/></FormControl><FormMessage /></FormItem>
                                )}/>
                                <FormField control={form.control} name="sex" render={({ field }) => (
                                    <FormItem><FormLabel>Gender</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} disabled={!isNewPatient && !isEditing && (!isKloqoMember || (isKloqoMember && bookingFor === 'member'))}>
                                        <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="Male">Male</SelectItem>
                                            <SelectItem value="Female">Female</SelectItem>
                                            <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage /></FormItem>
                                )}/>
                                 <FormField control={form.control} name="place" render={({ field }) => (
                                    <FormItem><FormLabel>Place</FormLabel><FormControl><Input {...field} disabled={!isNewPatient && !isEditing && (!isKloqoMember || (isKloqoMember && bookingFor === 'member'))} /></FormControl><FormMessage /></FormItem>
                                )}/>
                            </div>
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
                                            mode="single"
                                            selected={field.value}
                                            onSelect={(date) => {
                                              if (date) field.onChange(date);
                                              form.clearErrors("date");
                                            }}
                                            disabled={(date) => 
                                              date < new Date(new Date().setHours(0,0,0,0)) || 
                                              !selectedDoctor ||
                                              !availableDaysOfWeek.includes(getDay(date)) ||
                                              leaveDates.some(leaveDate => isSameDay(date, leaveDate))
                                            }
                                            initialFocus
                                            modifiers={selectedDoctor ? { available: { dayOfWeek: availableDaysOfWeek }, leave: leaveDates } : { leave: leaveDates }}
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
                                    )} />
                                    <FormField control={form.control} name="department" render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Department</FormLabel>
                                        <FormControl>
                                          <Input readOnly placeholder="Department" {...field} value={field.value ?? ''} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )} />
                               </div>

                              {selectedDoctor && selectedDate && (
                                  <FormField control={form.control} name="time" render={({ field }) => (
                                      <FormItem>
                                      <FormLabel>Select Time Slot</FormLabel>
                                      <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
                                          {timeSlots.length > 0 ? timeSlots.map(slot => (
                                              <Button
                                                key={slot.time}
                                                type="button"
                                                variant={field.value === format(parseDateFns(slot.time, "hh:mm a", new Date()), 'HH:mm') ? "default" : "outline"}
                                                onClick={() => {
                                                  const val = format(parseDateFns(slot.time, "hh:mm a", new Date()), 'HH:mm');
                                                  field.onChange(val);
                                                  if (val) form.clearErrors("time");
                                                }}
                                                disabled={slot.disabled}
                                                className={cn("text-xs", slot.disabled && "line-through")}
                                              >
                                                {slot.time}
                                              </Button>
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
                      </div>
                    )}
                    {(selectedPatient || isNewPatient || isEditing) && (
                    <div className="flex justify-end items-center pt-4">
                      <div className="flex justify-end gap-2">
                          {isEditing && <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>}
                          <Button type="submit" disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                            {isEditing ? "Save Changes" : "Book Appointment"}
                          </Button>
                      </div>
                    </div>
                    )}
                  </form>
                </Form>
              </CardContent>
            </Card>
          </main>
          <div className="flex flex-col justify-center items-center w-12">
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
    <CardTitle>{isDrawerExpanded ? "Appointment Details" : "Today's Appointments"}</CardTitle>
  </div>
  {isDrawerExpanded && (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
      </TabsList>
    </Tabs>
  )}
</div>
<div className="flex items-center gap-2 mt-2 w-full">
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
  {isDrawerExpanded && (
    <>
      <DateRangePicker
        initialDateRange={drawerDateRange}
        onDateChange={setDrawerDateRange}
        className="mx-2"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <Stethoscope className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setSelectedDrawerDoctor('all')}>All Doctors</DropdownMenuItem>
          {doctors.map(doc => (
            <DropdownMenuItem key={doc.id} onClick={() => setSelectedDrawerDoctor(doc.name)}>{doc.name}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="ml-2 text-xs text-muted-foreground">
        {selectedDrawerDoctor && selectedDrawerDoctor !== 'all' ? `Doctor: ${selectedDrawerDoctor}` : 'All Doctors'}
      </span>
      <Button variant="outline" size="icon">
        <Printer className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon">
        <FileDown className="h-4 w-4" />
      </Button>
    </>
  )}
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
                        {filteredAppointments.map((appointment) => (
                          <TableRow key={appointment.id} className={cn(isAppointmentOnLeave(appointment) && "bg-red-100 dark:bg-red-900/30")}>
                            <TableCell className="font-medium">{appointment.patientName}</TableCell>
                            <TableCell>{appointment.age}</TableCell>
                            <TableCell>{appointment.sex}</TableCell>
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
                                  <DropdownMenuItem onClick={() => handleDelete(appointment.id)} className="text-red-600">
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
                    <>
  <div className="flex items-center justify-between mb-2">
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
      </TabsList>
    </Tabs>
  </div>
  <Table>
  <TableHeader>
    <TableRow>
      <TableHead>Patient</TableHead>
      <TableHead>Token</TableHead>
      <TableHead>Time</TableHead>
      <TableHead className="text-right">{activeTab === 'completed' ? 'Status' : 'Actions'}</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {filteredAppointments
      .filter((appointment) => appointment.date === today)
      .map((appointment, index) => (
        <TableRow
          key={appointment.id}
          className={cn(
            appointment.isSkipped ? "bg-red-200 dark:bg-red-900/60" : isAppointmentOnLeave(appointment) && "bg-red-100 dark:bg-red-900/30"
          )}
        > 
          <TableCell className="font-medium">{appointment.patientName}</TableCell>
          <TableCell>{appointment.tokenNumber}</TableCell>
          <TableCell>{appointment.time}</TableCell>
          <TableCell className="text-right">
             {activeTab === 'completed' ? (
                <Badge variant="success">Completed</Badge>
            ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="p-0 h-auto">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {appointment.isSkipped ? (
                  <>
                    <DropdownMenuItem onClick={() => handleComplete(appointment)}>
                      Completed
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingAppointment(appointment)}>
                      Reschedule
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => handleComplete(appointment)}>
                      Completed
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingAppointment(appointment)}>
                      Reschedule
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSkip(appointment)}>
                      Skip
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleCancel(appointment)} className="text-red-600">
                      Cancel
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </TableCell>
        </TableRow>
      ))}
  </TableBody>
</Table>
</>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
      {primaryKloqoMember && (
          <AddRelativeDialog 
            isOpen={isAddRelativeDialogOpen}
            setIsOpen={setIsAddRelativeDialogOpen}
            primaryMemberId={primaryKloqoMember.id}
            onRelativeAdded={handleNewRelativeAdded}
          />
      )}
      <WeeklyDoctorAvailability />
    </>
  );
}

    