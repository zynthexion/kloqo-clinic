

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
import type { Appointment, Doctor, Patient, Visit, User } from "@/lib/types";
import { collection, getDocs, setDoc, doc, query, where, getDoc as getFirestoreDoc, updateDoc, increment, arrayUnion, deleteDoc, writeBatch, serverTimestamp, addDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { parse, isSameDay, parse as parseDateFns, format, getDay, isPast, isFuture, isToday, startOfYear, endOfYear, addMinutes, isBefore, subMinutes, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, FileDown, Printer, Search, MoreHorizontal, Eye, Edit, Trash2, ChevronRight, Stethoscope, Phone, Footprints, Loader2, Link as LinkIcon, Crown, UserCheck, UserPlus, Users, Plus, X, Clock, Calendar as CalendarLucide, CheckCircle2, Info, Send, MessageSquare, Smartphone } from "lucide-react";
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
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FirestorePermissionError } from "@/firebase/errors";
import { errorEmitter } from "@/firebase/error-emitter";
import Link from "next/link";
import { Label } from "@/components/ui/label";

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
  }).optional(),
  time: z.string().optional(),
  place: z.string().min(2, { message: "Place must be at least 2 characters." }),
  bookedVia: z.enum(["Advanced Booking", "Walk-in"]),
  tokenNumber: z.string().optional(),
  patientId: z.string().optional(),
});

type AppointmentFormValues = z.infer<typeof formSchema>;

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_VISIBLE_SLOTS = 6;

type WalkInEstimate = {
  estimatedTime: Date;
  patientsAhead: number;
  numericToken: number;
  slotIndex: number;
} | null;

/**
 * Helper function to parse time strings like "09:00 AM" relative to a given date.
 */
function parseTime(timeString: string, referenceDate: Date): Date {
    return parse(timeString, 'hh:mm a', referenceDate);
}

function parseAppointmentDateTime(dateStr: string, timeStr: string): Date {
    return parse(`${dateStr} ${timeStr}`, 'd MMMM yyyy hh:mm a', new Date());
}


/**
 * Generates all possible 15-minute time slots for a doctor on a given day.
 */
function generateAllTimeSlotsForDay(doctor: Doctor, date: Date): Date[] {
    const dayOfWeek = format(date, 'EEEE');
    const availabilityForDay = doctor.availabilitySlots?.find(slot => slot.day === dayOfWeek);

    if (!availabilityForDay) return [];

    const slots: Date[] = [];
    const consultationTime = doctor.averageConsultingTime || 15;

    availabilityForDay.timeSlots.forEach(timeSlot => {
        let currentTime = parseTime(timeSlot.from, date);
        const endTime = parseTime(timeSlot.to, date);
        while (currentTime < endTime) {
            slots.push(new Date(currentTime));
            currentTime = addMinutes(currentTime, consultationTime);
        }
    });

    return slots;
}


/**
 * Calculates walk-in token details including estimated time and queue position
 */
export async function calculateWalkInDetails(
  doctor: Doctor,
  walkInTokenAllotment: number = 3
): Promise<{
  estimatedTime: Date;
  patientsAhead: number;
  numericToken: number;
  slotIndex: number;
}> {
  const now = new Date();
  const todayDateStr = format(now, 'd MMMM yyyy');

  // 1. Fetch all appointments for today to identify booked slots and the last walk-in
  const appointmentsRef = collection(db, 'appointments');
  const q = query(
    appointmentsRef,
    where('doctor', '==', doctor.name),
    where('date', '==', todayDateStr),
    orderBy('numericToken', 'asc')
  );

  const querySnapshot = await getDocs(q);
  const todaysAppointments = querySnapshot.docs.map(doc => doc.data() as Appointment);

  // 2. Separate different types of appointments
  const advancedBookings = todaysAppointments.filter(apt => apt.bookedVia !== 'Walk-in');
  const walkIns = todaysAppointments.filter(apt => apt.bookedVia === 'Walk-in');

  // 3. Generate all possible time slots for the doctor today
  const allPossibleSlots = generateAllTimeSlotsForDay(doctor, now);
  if (allPossibleSlots.length === 0) {
    throw new Error('Doctor has no available slots today.');
  }

  // 4. Get a set of timestamps for already booked advanced appointments
  const bookedTimestamps = new Set(
    advancedBookings.map(apt => parseTime(apt.time, now).getTime())
  );

  // 5. Find the time of the last scheduled appointment (advanced or walk-in)
  const lastAdvancedBookingTime = advancedBookings.length > 0 
    ? parseTime(advancedBookings[advancedBookings.length - 1].time, now)
    : new Date(0);

  const lastWalkIn = walkIns.length > 0 ? walkIns[walkIns.length - 1] : null;
  const lastWalkInTime = lastWalkIn ? parseTime(lastWalkIn.time, now) : new Date(0);
    
  // 6. Determine the starting point for our search
  const searchStartTime = isAfter(now, lastWalkInTime) ? now : lastWalkInTime;

  // Find the index of the slot right after our search start time
  let searchStartIndex = allPossibleSlots.findIndex(slot => isAfter(slot, searchStartTime));
  if (searchStartIndex === -1) {
    searchStartIndex = allPossibleSlots.length; // Start from the end if all slots are in the past
  }

  let finalWalkInSlotIndex = -1;

  // 7. Decide which logic to use: spacing or consecutive
  if (isAfter(searchStartTime, lastAdvancedBookingTime)) {
    // ---- LOGIC 1: AFTER ALL ADVANCED BOOKINGS ARE DONE ----
    // Find the very next consecutive available slot
    for (let i = searchStartIndex; i < allPossibleSlots.length; i++) {
      const slot = allPossibleSlots[i];
      if (!bookedTimestamps.has(slot.getTime())) {
        finalWalkInSlotIndex = i;
        break;
      }
    }
  } else {
    // ---- LOGIC 2: BEFORE THE LAST ADVANCED BOOKING ----
    // Find the next slot after skipping `walkInTokenAllotment` number of *truly available* slots
    let availableSlotsSkipped = 0;
    for (let i = searchStartIndex; i < allPossibleSlots.length; i++) {
      const slot = allPossibleSlots[i];
      if (!bookedTimestamps.has(slot.getTime())) {
        // This is an available slot
        if (availableSlotsSkipped >= walkInTokenAllotment) {
          finalWalkInSlotIndex = i;
          break;
        }
        availableSlotsSkipped++;
      }
    }
  }

  // 8. Handle cases where no slot is found
  if (finalWalkInSlotIndex === -1) {
    // If spacing logic fails (e.g., not enough available slots to skip),
    // find the *very first* available slot after the search start index.
    for (let i = searchStartIndex; i < allPossibleSlots.length; i++) {
        if (!bookedTimestamps.has(allPossibleSlots[i].getTime())) {
            finalWalkInSlotIndex = i;
            break;
        }
    }
    if (finalWalkInSlotIndex === -1) {
        throw new Error('No available walk-in slots remaining for today.');
    }
  }

  const estimatedTime = allPossibleSlots[finalWalkInSlotIndex];

  // 9. Calculate new token number and patients ahead
  const newNumericToken = todaysAppointments.length > 0
    ? Math.max(...todaysAppointments.map(a => a.numericToken)) + 1
    : 1;

  // Count patients with appointments scheduled between now and the user's estimated time
  const patientsAhead = todaysAppointments.filter(apt => {
      const aptTime = parseAppointmentDateTime(apt.date, apt.time);
      const isActive = apt.status !== 'Completed' && apt.status !== 'Cancelled' && !apt.isSkipped && apt.status !== 'No-show';
      return isActive && isAfter(aptTime, now) && isBefore(aptTime, estimatedTime!);
  }).length;
  
  return {
    estimatedTime,
    patientsAhead,
    numericToken: newNumericToken,
    slotIndex: finalWalkInSlotIndex,
  };
}


export default function AppointmentsPage() {
  const auth = useAuth();
  const searchParams = useSearchParams();

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [clinicDetails, setClinicDetails] = useState<any>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[]>([]);
  const [isPatientPopoverOpen, setIsPatientPopoverOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [primaryPatient, setPrimaryPatient] = useState<Patient | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSendingLink, setIsSendingLink] = useTransition();
  const [drawerSearchTerm, setDrawerSearchTerm] = useState("");
  const [selectedDrawerDoctor, setSelectedDrawerDoctor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("upcoming");
  const currentYearStart = startOfYear(new Date());
  const currentYearEnd = endOfYear(new Date());
  const [drawerDateRange, setDrawerDateRange] = useState<DateRange | undefined>({ from: currentYearStart, to: currentYearEnd });
  const [bookingFor, setBookingFor] = useState('member');
  const [relatives, setRelatives] = useState<Patient[]>([]);
  const [isAddRelativeDialogOpen, setIsAddRelativeDialogOpen] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [walkInEstimate, setWalkInEstimate] = useState<WalkInEstimate>(null);
  const [isCalculatingEstimate, setIsCalculatingEstimate] = useState(false);
  
  const [linkChannel, setLinkChannel] = useState<'sms' | 'whatsapp'>('sms');

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
      department: "",
      date: undefined,
      time: undefined,
      place: "",
      bookedVia: "Advanced Booking",
    },
  });

  const patientInputRef = useRef<HTMLInputElement>(null);

  const handlePatientSearch = useCallback(async (phone: string) => {
    if (phone.length < 10 || !clinicId) {
      setPatientSearchResults([]);
      setIsPatientPopoverOpen(false);
      return;
    }
  
    startTransition(async () => {
      try {
        const fullPhoneNumber = `+91${phone}`;
        const patientsRef = collection(db, 'patients');
        
        const primaryQuery = query(patientsRef, where('phone', '==', fullPhoneNumber), limit(1));
        const primarySnapshot = await getDocs(primaryQuery);

        if (primarySnapshot.empty) {
            setPatientSearchResults([]);
            setIsPatientPopoverOpen(false);
            form.setValue('phone', phone);
            return;
        }

        const primaryDoc = primarySnapshot.docs[0];
        const primaryPatient = { id: primaryDoc.id, ...primaryDoc.data() } as Patient;
        primaryPatient.isKloqoMember = primaryPatient.clinicIds?.includes(clinicId);
        
        setPatientSearchResults([primaryPatient]);
        setIsPatientPopoverOpen(true);

      } catch (error) {
        console.error("Error searching patient:", error);
        toast({variant: 'destructive', title: 'Search Error', description: 'Could not perform patient search.'});
      }
    });
  }, [clinicId, toast, form]);


  useEffect(() => {
    const handler = setTimeout(() => {
      if (patientSearchTerm.length >= 5) {
        handlePatientSearch(patientSearchTerm);
      } else {
        setPatientSearchResults([]);
        setIsPatientPopoverOpen(false);
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [patientSearchTerm, handlePatientSearch]);


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

        const clinicDoc = await getFirestoreDoc(doc(db, 'clinics', userClinicId));
        if (clinicDoc.exists()) {
          setClinicDetails(clinicDoc.data());
        }

        const appointmentsQuery = query(collection(db, "appointments"), where("clinicId", "==", userClinicId));
        const appointmentsSnapshot = await getDocs(appointmentsQuery);
        const appointmentsList = appointmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
        setAppointments(appointmentsList);

        const doctorsQuery = query(collection(db, "doctors"), where("clinicId", "==", userClinicId));
        const doctorsSnapshot = await getDocs(doctorsQuery);
        const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);

        if (doctorsList.length > 0 && !form.getValues('doctor')) {
          const firstDoctor = doctorsList[0];
          form.setValue("doctor", firstDoctor.id, { shouldValidate: true });
          form.setValue("department", firstDoctor.department || "", { shouldValidate: true });
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        if (!(error instanceof FirestorePermissionError)) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to load initial data. Please refresh the page.",
          });
        }
      } finally {
        setLoading(false);
      }
    };

    if (auth.currentUser) {
      fetchInitialData();
    }
  }, [auth.currentUser, toast, form]);
  
  useEffect(() => {
    // Only run this logic once when the component has loaded appointments
    if (appointments.length > 0) {
      const now = new Date();
      const noShowAppointments = appointments.filter(apt => 
        apt.status === 'Pending' && isPast(parseAppointmentDateTime(apt.date, apt.time))
      );

      if (noShowAppointments.length > 0) {
        startTransition(async () => {
          const batch = writeBatch(db);
          noShowAppointments.forEach(appointment => {
            const appointmentRef = doc(db, "appointments", appointment.id);
            batch.update(appointmentRef, { status: "No-show" });
          });

          try {
            await batch.commit();
            
            // Update local state to reflect the change immediately
            setAppointments(prev => prev.map(apt => {
              if (noShowAppointments.some(ns => ns.id === apt.id)) {
                return { ...apt, status: 'No-show' };
              }
              return apt;
            }));

            toast({
              title: "Appointments Updated",
              description: `${noShowAppointments.length} pending appointment(s) have been marked as 'No-show'.`,
            });

          } catch (error) {
            console.error("Error batch updating no-show appointments:", error);
            if (!(error instanceof FirestorePermissionError)) {
              toast({
                variant: "destructive",
                title: "Update Failed",
                description: "Could not update appointment statuses for no-shows.",
              });
            }
          }
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]); // Rerunning only when loading state changes from true to false

  const resetForm = useCallback(() => {
    setEditingAppointment(null);
    setPatientSearchTerm("");
    setSelectedPatient(null);
    setPrimaryPatient(null);
    setRelatives([]);
    setBookingFor('member');
    form.reset({
      patientName: "",
      phone: "",
      age: 0,
      sex: "Male",
      doctor: doctors.length > 0 ? doctors[0].id : "",
      department: doctors.length > 0 ? doctors[0].department || "" : "",
      date: undefined,
      time: undefined,
      place: "",
      bookedVia: "Advanced Booking",
    });
  }, [form, doctors]);

  useEffect(() => {
    if (editingAppointment) {
      const doctor = doctors.find(d => d.name === editingAppointment.doctor);
      if (doctor) {
        const appointmentDate = parse(editingAppointment.date, "d MMMM yyyy", new Date());
        const loadPatientForEditing = async () => {
          if (editingAppointment.patientId) {
            const patientDoc = await getFirestoreDoc(doc(db, "patients", editingAppointment.patientId));
            if (patientDoc.exists()) {
              const patientData = patientDoc.data() as Patient;
              setSelectedPatient(patientData);
              setPatientSearchTerm(patientData.phone.replace('+91', ''));
              form.setValue('phone', patientData.phone.replace('+91', ''));
            }
          }
        };
        loadPatientForEditing();

        form.reset({
          ...editingAppointment,
          phone: editingAppointment.communicationPhone.replace('+91', ''),
          date: isNaN(appointmentDate.getTime()) ? undefined : appointmentDate,
          doctor: doctor.id,
          time: format(parseDateFns(editingAppointment.time, "hh:mm a", new Date()), 'HH:mm'),
          bookedVia: (editingAppointment.bookedVia === "Advanced Booking" || editingAppointment.bookedVia === "Walk-in") ? editingAppointment.bookedVia : "Advanced Booking",
        });
      }
    } else {
      resetForm();
    }
  }, [editingAppointment, form, doctors, resetForm]);

  const selectedDoctor = useMemo(() => {
    const doctorId = form.watch("doctor");
    if (!doctorId) return doctors.length > 0 ? doctors[0] : null;
    return doctors.find(d => d.id === doctorId) || null;
  }, [doctors, form.watch("doctor")]);

  const selectedDate = form.watch("date");
  const appointmentType = form.watch("bookedVia");

  const generateNextToken = async (date: Date, type: 'A' | 'W'): Promise<{tokenNumber: string, numericToken: number}> => {
    if (!clinicId || !selectedDoctor) return { tokenNumber: `${type}001`, numericToken: 1 };
    const dateStr = format(date, "d MMMM yyyy");
    const appointmentsRef = collection(db, 'appointments');
    const q = query(
      appointmentsRef,
      where('clinicId', '==', clinicId),
      where('doctor', '==', selectedDoctor.name),
      where('date', '==', dateStr),
    );
    const querySnapshot = await getDocs(q);
    const tokenNumbers = querySnapshot.docs.map(doc => {
      const token = doc.data().tokenNumber;
      if (typeof token === 'string' && (token.startsWith('A') || token.startsWith('W'))) {
        return parseInt(token.substring(1));
      }
      return 0;
    }).filter(num => !isNaN(num) && num > 0);
    const lastToken = tokenNumbers.length > 0 ? Math.max(...tokenNumbers) : 0;
    const nextTokenNum = lastToken + 1;
    return { tokenNumber: `${type}${String(nextTokenNum).padStart(3, '0')}`, numericToken: nextTokenNum };
  };

  const isWithinBookingWindow = (doctor: Doctor | null): boolean => {
    if (!doctor || !doctor.availabilitySlots) return false;
    const now = new Date();
    const todayStr = format(now, 'EEEE');
    const todaySlots = doctor.availabilitySlots.find(s => s.day === todayStr);
    if (!todaySlots) return false;

    const getTimeOnDate = (timeStr: string, date: Date) => {
      const newDate = new Date(date);
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      newDate.setHours(hours, minutes, 0, 0);
      return newDate;
    };

    for (const session of todaySlots.timeSlots) {
      const sessionStart = getTimeOnDate(session.from, now);
      const sessionEnd = getTimeOnDate(session.to, now);
      const bookingWindowStart = subMinutes(sessionStart, 30);
      const bookingWindowEnd = subMinutes(sessionEnd, 30);
      if (now >= bookingWindowStart && now <= bookingWindowEnd) return true;
    }
    return false;
  };

  const isWalkInAvailable = useMemo(() => {
    if (appointmentType !== 'Walk-in' || !selectedDoctor) return false;
    return isWithinBookingWindow(selectedDoctor);
  }, [appointmentType, selectedDoctor]);

  useEffect(() => {
    if (appointmentType === 'Walk-in' && selectedDoctor && isWalkInAvailable) {
      setIsCalculatingEstimate(true);
      const allotment = clinicDetails?.walkInTokenAllotment || 3;
      calculateWalkInDetails(selectedDoctor, allotment).then(details => {
        setWalkInEstimate(details);
        setIsCalculatingEstimate(false);
      }).catch(err => {
        console.error("Error calculating walk-in details:", err);
        setWalkInEstimate(null);
        setIsCalculatingEstimate(false);
      });
    } else {
      setWalkInEstimate(null);
    }
  }, [appointmentType, selectedDoctor, isWalkInAvailable, clinicDetails]);

  async function onSubmit(values: AppointmentFormValues) {
    if (!auth.currentUser || !clinicId || !selectedDoctor) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in and select a doctor to book an appointment." });
      return;
    }

    if (appointmentType === 'Walk-in' && !walkInEstimate) {
      toast({ variant: "destructive", title: "Booking Not Available", description: "Walk-in tokens are not available for this doctor at this time." });
      return;
    }

    startTransition(async () => {
      try {
        const batch = writeBatch(db);
        let patientForAppointmentId: string;
        let patientForAppointmentName: string;
        
        const patientPhoneNumber = values.phone.startsWith('+91') ? values.phone : `+91${values.phone}`;
        const communicationPhone = primaryPatient?.phone || patientPhoneNumber;

        // Uniqueness check for new patients
        if (!selectedPatient && !isEditing) {
             const q = query(collection(db, 'patients'), where('phone', '==', patientPhoneNumber));
             const existingPatientSnap = await getDocs(q);
             if (!existingPatientSnap.empty) {
                 toast({
                     variant: "destructive",
                     title: "Duplicate Patient",
                     description: "A patient with this phone number already exists. Please search for them instead.",
                 });
                 return;
             }
        }

        const patientDataToUpdate = {
          name: values.patientName,
          age: values.age,
          sex: values.sex,
          place: values.place,
          phone: patientPhoneNumber,
        };

        if (isEditing && editingAppointment) {
          patientForAppointmentId = editingAppointment.patientId;
          const patientRef = doc(db, 'patients', patientForAppointmentId);
          batch.update(patientRef, { ...patientDataToUpdate, updatedAt: serverTimestamp() });
          patientForAppointmentName = values.patientName;
        } else if (selectedPatient && !isEditing) {
          patientForAppointmentId = selectedPatient.id;
          const patientRef = doc(db, 'patients', patientForAppointmentId);
          const clinicIds = selectedPatient.clinicIds || [];
          const updateData: any = { ...patientDataToUpdate, updatedAt: serverTimestamp() };
          if (!clinicIds.includes(clinicId)) {
            updateData.clinicIds = arrayUnion(clinicId);
          }
          batch.update(patientRef, updateData);
          patientForAppointmentName = values.patientName;
        } else {
          const newPatientRef = doc(collection(db, 'patients'));
          const newPatientData: Patient = {
            id: newPatientRef.id,
            ...patientDataToUpdate,
            clinicIds: [clinicId],
            visitHistory: [],
            totalAppointments: 0,
            relatedPatientIds: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          batch.set(newPatientRef, newPatientData);
          patientForAppointmentId = newPatientRef.id;
          patientForAppointmentName = values.patientName;
        }

        await batch.commit().catch(e => {
          const permissionError = new FirestorePermissionError({
            path: 'batch write', operation: 'write', requestResourceData: values
          });
          errorEmitter.emit('permission-error', permissionError);
          throw permissionError;
        });

        if (appointmentType === 'Walk-in') {
          if (!walkInEstimate) {
            toast({ variant: "destructive", title: "Error", description: "Could not calculate walk-in time. Please try again." });
            return;
          }
          const date = new Date();
          
          const appointmentData: Omit<Appointment, 'id'> = {
            bookedVia: appointmentType,
            clinicId: selectedDoctor.clinicId,
            date: format(date, "d MMMM yyyy"),
            department: selectedDoctor.department,
            doctor: selectedDoctor.name,
            sex: values.sex,
            patientId: patientForAppointmentId,
            patientName: values.patientName,
            age: values.age,
            communicationPhone: communicationPhone,
            place: values.place,
            status: 'Pending',
            time: format(walkInEstimate.estimatedTime, "hh:mm a"),
            tokenNumber: `W${String(walkInEstimate.numericToken).padStart(3, '0')}`,
            numericToken: walkInEstimate.numericToken,
            slotIndex: walkInEstimate.slotIndex,
            treatment: "General Consultation",
          };
          const appointmentRef = doc(collection(db, 'appointments'));
          await setDoc(appointmentRef, { ...appointmentData, id: appointmentRef.id });
          setAppointments(prev => [...prev, { ...appointmentData, id: appointmentRef.id }]);

          setGeneratedToken(appointmentData.tokenNumber);
          setIsTokenModalOpen(true);

        } else {
          if (!values.date || !values.time) {
            toast({ variant: "destructive", title: "Missing Information", description: "Please select a date and time for the appointment." });
            return;
          }
          const appointmentId = isEditing && editingAppointment ? editingAppointment.id : doc(collection(db, "appointments")).id;
          const tokenData = isEditing && editingAppointment ? { tokenNumber: editingAppointment.tokenNumber, numericToken: editingAppointment.numericToken } : await generateNextToken(values.date, 'A');
          const appointmentDateStr = format(values.date, "d MMMM yyyy");
          const appointmentTimeStr = format(parseDateFns(values.time, "HH:mm", new Date()), "hh:mm a");

          const appointmentData: Appointment = {
            id: appointmentId,
            clinicId: clinicId,
            patientId: patientForAppointmentId,
            patientName: patientForAppointmentName,
            sex: values.sex,
            communicationPhone: communicationPhone,
            age: values.age,
            doctor: selectedDoctor.name,
            date: appointmentDateStr,
            time: appointmentTimeStr,
            department: values.department,
            status: isEditing ? editingAppointment!.status : "Pending",
            treatment: "General Consultation",
            tokenNumber: tokenData.tokenNumber,
            numericToken: tokenData.numericToken,
            bookedVia: values.bookedVia,
            place: values.place,
          };

          const appointmentRef = doc(db, 'appointments', appointmentId);
          await setDoc(appointmentRef, appointmentData, { merge: true });

          if (!isEditing) {
            const patientRef = doc(db, 'patients', patientForAppointmentId);
            const newVisit: Visit = {
              appointmentId: appointmentId,
              date: appointmentDateStr,
              time: appointmentTimeStr,
              doctor: selectedDoctor.name,
              department: values.department,
              status: 'Pending',
              treatment: 'General Consultation',
            };
            await updateDoc(patientRef, {
              visitHistory: arrayUnion(newVisit),
              totalAppointments: increment(1),
              updatedAt: serverTimestamp(),
            });
          }

          if (isEditing) {
            setAppointments(prev => prev.map(apt => apt.id === appointmentId ? appointmentData : apt));
            toast({ title: "Appointment Rescheduled", description: `Appointment for ${appointmentData.patientName} has been updated.` });
          } else {
            setAppointments(prev => [...prev, appointmentData]);
            toast({ title: "Appointment Booked", description: `Appointment for ${appointmentData.patientName} has been successfully booked.` });
          }
        }
        resetForm();
      } catch (error) {
        console.error("Error saving appointment: ", error);
        if (!(error instanceof FirestorePermissionError)) {
          toast({ variant: "destructive", title: "Error", description: "Failed to save appointment. Please try again." });
        }
      }
    });
  }

 const handleSendLink = async () => {
    const fullPhoneNumber = `+91${patientSearchTerm}`;
    if (!patientSearchTerm || !clinicId || patientSearchTerm.length !== 10) {
        toast({ variant: "destructive", title: "Invalid Phone Number", description: "Please enter a 10-digit phone number to send a link." });
        return;
    }

    setIsSendingLink(true);
    try {
        const usersRef = collection(db, 'users');
        const userQuery = query(usersRef, where('phone', '==', fullPhoneNumber));
        
        const userSnapshot = await getDocs(userQuery).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: 'users',
                operation: 'list',
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });


        if (!userSnapshot.empty) {
            toast({
                variant: "destructive",
                title: "User Already Exists",
                description: `A user with the phone number ${fullPhoneNumber} is already registered.`
            });
            setIsSendingLink(false);
            return;
        }

        const batch = writeBatch(db);
        const newUserRef = doc(collection(db, 'users'));
        const newPatientRef = doc(collection(db, 'patients'));

        const newUserData: Pick<User, 'uid' | 'phone' | 'role' | 'patientId'> = {
            uid: newUserRef.id,
            phone: fullPhoneNumber,
            role: 'patient',
            patientId: newPatientRef.id,
        };
        batch.set(newUserRef, newUserData);

        const newPatientData: Partial<Patient> = {
            id: newPatientRef.id,
            primaryUserId: newUserRef.id,
            phone: fullPhoneNumber,
            name: "",
            age: 0,
            sex: "",
            place: "",
            relatedPatientIds: [],
            visitHistory: [],
            totalAppointments: 0,
            clinicIds: [clinicId],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        batch.set(newPatientRef, newPatientData as Patient);

        await batch.commit().catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: 'users or patients',
                operation: 'write',
                requestResourceData: { user: newUserData, patient: newPatientData }
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });

        toast({
            title: "Link Sent (Simulated)",
            description: `A registration link has been sent to ${fullPhoneNumber}. New user and patient records created.`
        });
        setPatientSearchTerm(''); 

    } catch (error: any) {
         if (error.name !== 'FirestorePermissionError') {
             console.error("Error in send link flow:", error);
             toast({ variant: 'destructive', title: 'Error', description: 'Could not complete the action.' });
         }
    } finally {
        setIsSendingLink(false);
    }
  };

  const handleCancel = (appointment: Appointment) => {
    startTransition(async () => {
      try {
        const appointmentRef = doc(db, "appointments", appointment.id);
        await updateDoc(appointmentRef, { status: 'Cancelled' });
        setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'Cancelled' } : a));
        toast({ title: "Appointment Cancelled" });
      } catch (error) {
        console.error("Error cancelling appointment:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to cancel appointment." });
      }
    });
  };

  const handleComplete = async (appointment: Appointment) => {
    startTransition(async () => {
      try {
        const appointmentRef = doc(db, "appointments", appointment.id);
        await updateDoc(appointmentRef, { status: 'Completed' });
        setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'Completed' } : a));
        toast({ title: "Appointment Marked as Completed" });
      } catch (error) {
        console.error("Error completing appointment:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to mark as completed." });
      }
    });
  };

  const handleSkip = async (appointment: Appointment) => {
    startTransition(async () => {
      try {
        const appointmentRef = doc(db, "appointments", appointment.id);
        await updateDoc(appointmentRef, { isSkipped: true });
        setAppointments(prev => {
          const updated = prev.map(a => a.id === appointment.id ? { ...a, isSkipped: true } : a);
          return [
            ...updated.filter(a => !a.isSkipped),
            ...updated.filter(a => a.isSkipped),
          ];
        });
        toast({ title: "Appointment Skipped" });
      } catch (error) {
        console.error("Error skipping appointment:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to skip appointment." });
      }
    });
  };

  const handleDelete = async (appointmentId: string) => {
    startTransition(async () => {
      try {
        await deleteDoc(doc(db, "appointments", appointmentId));
        setAppointments(prev => prev.filter(apt => apt.id !== appointmentId));
        toast({ title: "Success", description: "Appointment deleted successfully." });
      } catch (error) {
        console.error("Error deleting appointment: ", error);
        if (!(error instanceof FirestorePermissionError)) {
          toast({ variant: "destructive", title: "Error", description: "Failed to delete appointment." });
        }
      }
    });
  };

  const onDoctorChange = (doctorId: string) => {
    form.setValue("doctor", doctorId);
    const doctor = doctors.find(d => d.id === doctorId);
    if (doctor) {
      form.setValue("department", doctor.department || "", { shouldValidate: true });
      form.setValue("date", undefined, { shouldValidate: true });
      form.setValue("time", "", { shouldValidate: true });
    }
  };

  const handlePatientSelect = async (patient: Patient) => {
    setSelectedPatient(patient);
    setPrimaryPatient(patient);
    setBookingFor('member');
    setRelatives([]);

    const capitalizedSex = patient.sex ? (patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1).toLowerCase()) : "Male";

    form.reset({
      ...form.getValues(),
      patientId: patient.id,
      patientName: patient.name,
      age: patient.age,
      sex: capitalizedSex as "Male" | "Female" | "Other",
      phone: patient.phone.replace('+91', ''),
      place: patient.place || "",
    });

    if (patient.relatedPatientIds && patient.relatedPatientIds.length > 0) {
      const relativePromises = patient.relatedPatientIds.map(id => getFirestoreDoc(doc(db, 'patients', id)));
      const relativeDocs = await Promise.all(relativePromises);
      const fetchedRelatives = relativeDocs
        .filter(doc => doc.exists())
        .map(doc => ({ id: doc.id, ...doc.data() } as Patient));
      setRelatives(fetchedRelatives);
    }

    setPatientSearchTerm(patient.phone.replace('+91', ''));
    setIsPatientPopoverOpen(false);
  };

  const handleRelativeSelect = (relative: Patient) => {
    setBookingFor('relative');
    setSelectedPatient(relative);
    const capitalizedSex = relative.sex ? (relative.sex.charAt(0).toUpperCase() + relative.sex.slice(1).toLowerCase()) : "Male";
    form.reset({
      ...form.getValues(),
      patientId: relative.id,
      patientName: relative.name,
      age: relative.age,
      sex: capitalizedSex as "Male" | "Female" | "Other",
      phone: relative.phone.replace('+91', ''),
      place: relative.place || "",
    });
    toast({ title: `Selected Relative: ${relative.name}`, description: "You are now booking an appointment for the selected relative." });
  };

  const handleNewRelativeAdded = (newRelative: Patient) => {
    setRelatives(prev => [...prev, newRelative]);
    handleRelativeSelect(newRelative);
  };

  const handlePatientSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (selectedPatient && value !== selectedPatient.phone.replace('+91', '')) {
      resetForm();
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
    if (!selectedDoctor?.leaveSlots) return [];
    return selectedDoctor.leaveSlots
      .filter(leaveSlot => leaveSlot && leaveSlot.date && leaveSlot.slots?.length > 0)
      .map(ls => parse(ls.date, 'yyyy-MM-dd', new Date()));
  }, [selectedDoctor?.leaveSlots]);

  const sessionSlots = useMemo(() => {
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
    
    const leaveForDate = selectedDoctor.leaveSlots?.find(ls => ls.date && isSameDay(parse(ls.date, 'yyyy-MM-dd', new Date()), selectedDate));
    const leaveTimeSlots = leaveForDate ? leaveForDate.slots : [];

    const sessions = availabilityForDay.timeSlots.map((session, sessionIndex) => {
      const slots = [];
      let availableCount = 0;
      let currentTime = parseDateFns(session.from, 'hh:mm a', selectedDate);
      const endTime = parseDateFns(session.to, 'hh:mm a', selectedDate);

      while (currentTime < endTime) {
        const slotTime = format(currentTime, "hh:mm a");
        let status: 'available' | 'booked' | 'leave' = 'available';

        if (bookedSlotsForDay.includes(slotTime)) {
          status = 'booked';
        } else if (leaveTimeSlots.some(leaveSlot => {
          const leaveStart = parseDateFns(leaveSlot.from, 'hh:mm a', selectedDate);
          const leaveEnd = parseDateFns(leaveSlot.to, 'hh:mm a', selectedDate);
          return currentTime >= leaveStart && currentTime < leaveEnd;
        })) {
          status = 'leave';
        }

        if (isToday(selectedDate) && isBefore(currentTime, subMinutes(new Date(), -30))) {
            status = 'booked'; 
        }

        if (status === 'available') {
            if (availableCount < MAX_VISIBLE_SLOTS) {
                slots.push({ time: slotTime, status });
                availableCount++;
            }
        } else {
            slots.push({ time: slotTime, status });
        }
        
        currentTime = new Date(currentTime.getTime() + selectedDoctor.averageConsultingTime! * 60000);
      }
      
      const sessionTitle = `Session ${sessionIndex + 1} (${session.from} - ${session.to})`;
      return { title: sessionTitle, slots };
    });

    return sessions.filter(s => s.slots.length > 0);
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
          const from = drawerDateRange.from ? new Date(drawerDateRange.from.setHours(0, 0, 0, 0)) : null;
          const to = drawerDateRange.to ? new Date(drawerDateRange.to.setHours(23, 59, 59, 999)) : null;
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
        } catch (e) {
          return false;
        }
      });
    } else if (activeTab === 'completed') {
      filtered = filtered.filter(apt => apt.status === 'Completed');
    } else if (activeTab !== 'all') {
      filtered = filtered.filter(apt => apt.status.toLowerCase() === activeTab);
    }

    return filtered.sort((a, b) => {
      try {
        const dateA = new Date(`${a.date} ${a.time}`).getTime();
        const dateB = new Date(`${b.date} ${b.time}`).getTime();
        return dateA - dateB;
      } catch (e) {
        return 0;
      }
    });
  }, [appointments, drawerSearchTerm, activeTab, drawerDateRange, selectedDrawerDoctor]);

  const today = format(new Date(), "d MMMM yyyy");
  const todaysAppointments = filteredAppointments.filter(apt => apt.date === today);

  const isNewPatient = patientSearchTerm.length >= 10 && !selectedPatient;
  const isKloqoMember = primaryPatient && !primaryPatient.clinicIds?.includes(clinicId!);

  return (
    <>
      <div className="flex-1 overflow-auto">
        <main className="p-6">
          <div className={cn("grid gap-6 transition-all duration-300 ease-in-out", isDrawerExpanded ? "grid-cols-1 md:grid-cols-[3fr_auto_9fr]" : "grid-cols-1 md:grid-cols-[9fr_auto_3fr]")}>
            <main>
              <Card>
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
                      <Popover open={isPatientPopoverOpen} onOpenChange={setIsPatientPopoverOpen}>
                        <PopoverTrigger asChild>
                            <FormItem>
                            <FormLabel>Search Patient by Phone</FormLabel>
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
                            <FormMessage />
                            </FormItem>
                        </PopoverTrigger>

                        <PopoverContent onOpenAutoFocus={(e) => e.preventDefault()} className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                            <CommandList>
                                {isPending ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
                                ) : patientSearchResults.length > 0 ? (
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
                                          {patient.name || "Unnamed Patient"}
                                          <span className="text-xs text-muted-foreground ml-2">{patient.phone}</span>
                                        </div>
                                        <Badge variant={isClinicPatient ? "secondary" : "outline"} className={cn(
                                          isClinicPatient ? "text-blue-600 border-blue-500" : "text-amber-600 border-amber-500"
                                        )}>
                                          {isClinicPatient ? (
                                            <UserCheck className="mr-1.5 h-3 w-3" />
                                          ) : (
                                            <Crown className="mr-1.5 h-3 w-3" />
                                          )}
                                          {isClinicPatient ? "Existing Patient" : "Kloqo Member"}
                                        </Badge>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                                ) : (
                                   patientSearchTerm.length >= 5 && <CommandEmpty>No patient found.</CommandEmpty>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                         <div className="border p-4 rounded-lg space-y-4">
                          <div className="flex justify-between items-center">
                            <Label>Send Patient Booking Link</Label>
                             <RadioGroup value={linkChannel} onValueChange={(v) => setLinkChannel(v as any)} className="flex items-center space-x-2">
                                <Label htmlFor="sms-channel" className="flex items-center gap-2 cursor-pointer">
                                  <RadioGroupItem value="sms" id="sms-channel" />
                                  <MessageSquare className="h-5 w-5" /> SMS
                                </Label>
                                <Label htmlFor="whatsapp-channel" className="flex items-center gap-2 cursor-pointer">
                                  <RadioGroupItem value="whatsapp" id="whatsapp-channel" />
                                  <Smartphone className="h-5 w-5" /> WhatsApp
                                </Label>
                            </RadioGroup>
                            <Button type="button" onClick={handleSendLink} disabled={isSendingLink || patientSearchTerm.length < 10}>
                                {isSendingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <LinkIcon className="mr-2 h-4 w-4" />}
                                Send
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {(selectedPatient || isNewPatient || isEditing) && (
                        <>
                          <div className="pt-4 border-t">
                             <div className="flex justify-center mb-4">
                                <RadioGroup onValueChange={(value) => form.setValue('bookedVia', value as any)} value={form.watch('bookedVia')} className="flex items-center space-x-4 rounded-full p-1 bg-muted">
                                    <Label htmlFor="advanced-booking" className={cn("px-4 py-1.5 rounded-full cursor-pointer transition-colors", form.watch('bookedVia') === 'Advanced Booking' ? "bg-background shadow-sm" : "")}>
                                        <RadioGroupItem value="Advanced Booking" id="advanced-booking" className="sr-only" />
                                        Advanced Booking
                                    </Label>
                                    <Label htmlFor="walk-in" className={cn("px-4 py-1.5 rounded-full cursor-pointer transition-colors", form.watch('bookedVia') === 'Walk-in' ? "bg-background shadow-sm" : "")}>
                                        <RadioGroupItem value="Walk-in" id="walk-in" className="sr-only" />
                                        Walk-in
                                    </Label>
                                </RadioGroup>
                            </div>
                            {primaryPatient && (relatives.length > 0 || isKloqoMember) && !isEditing && (
                              <div className="mb-4">
                                <Tabs value={bookingFor} onValueChange={(value) => {
                                  setBookingFor(value);
                                  if (value === 'member' && primaryPatient) {
                                    setSelectedPatient(primaryPatient);
                                    const capitalizedSex = primaryPatient.sex ? (primaryPatient.sex.charAt(0).toUpperCase() + primaryPatient.sex.slice(1).toLowerCase()) : "Male";
                                    form.reset({
                                      ...form.getValues(),
                                      patientId: primaryPatient.id,
                                      patientName: primaryPatient.name,
                                      age: primaryPatient.age,
                                      sex: capitalizedSex as "Male" | "Female" | "Other",
                                      phone: primaryPatient.phone.replace('+91', ''),
                                      place: primaryPatient.place || "",
                                    });
                                  }
                                }}>
                                  <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="member">For Member</TabsTrigger>
                                    <TabsTrigger value="relative">For a Relative</TabsTrigger>
                                  </TabsList>
                                  <TabsContent value="member" className="mt-4">
                                    <div className="text-sm p-4 bg-muted/50 rounded-lg">
                                      <p><strong>Name:</strong> {primaryPatient.name}</p>
                                      <p><strong>Place:</strong> {primaryPatient.place}</p>
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
                                            {relatives.map((relative) => (
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
                              </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 mt-4">
                              <div className="space-y-4 md:col-span-1">
                                <h3 className="text-lg font-medium border-b pb-2 flex items-center justify-between">
                                  Patient Details
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                  <FormField control={form.control} name="patientName" render={({ field }) => (
                                    <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                  )} />
                                  <FormField control={form.control} name="age" render={({ field }) => (
                                    <FormItem><FormLabel>Age</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                  )} />
                                  <FormField control={form.control} name="sex" render={({ field }) => (
                                    <FormItem><FormLabel>Gender</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                          <SelectItem value="Male">Male</SelectItem>
                                          <SelectItem value="Female">Female</SelectItem>
                                          <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )} />
                                  <FormField control={form.control} name="place" render={({ field }) => (
                                    <FormItem><FormLabel>Place</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                  )} />
                                </div>
                                
                                 <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Communication Phone</FormLabel>
                                        <FormControl>
                                        <Input
                                            type="tel"
                                            placeholder="Enter 10-digit number"
                                            {...field}
                                            disabled={bookingFor === 'member' || isEditing}
                                        />
                                        </FormControl>
                                        <FormDescription className="text-xs">This number will be used for appointment communication.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                              </div>
                              <div className="space-y-4 md:col-span-1">
                                <h3 className="text-lg font-medium border-b pb-2">Appointment Details</h3>
                                {appointmentType === 'Advanced Booking' ? (
                                  <FormField control={form.control} name="date" render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                      <FormLabel>Select Date</FormLabel>
                                      <Calendar
                                        className="bg-primary text-primary-foreground rounded-md [&_button:hover]:bg-primary/80 [&_.rdp-day_today]:bg-primary-foreground/20 [&_button]:text-primary-foreground"
                                        mode="single"
                                        selected={field.value}
                                        onSelect={(date) => {
                                          if (date) field.onChange(date);
                                          form.clearErrors("date");
                                        }}
                                        disabled={(date) =>
                                          date < new Date(new Date().setHours(0, 0, 0, 0)) ||
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
                                  )} />
                                ) : (
                                  <Card className={cn("mt-4", walkInEstimate ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200")}>
                                      <CardHeader className="flex-row items-start gap-3 space-y-0 p-4">
                                        <Info className={cn("w-6 h-6 mt-1", walkInEstimate ? "text-green-600" : "text-red-600")} />
                                        <div>
                                            <CardTitle className="text-base">{walkInEstimate ? "Walk-in Available" : "Walk-in Unavailable"}</CardTitle>
                                            <CardDescription className={cn("text-xs", walkInEstimate ? "text-green-800" : "text-red-800")}>
                                                {walkInEstimate ? "Estimated waiting time is shown below." : "This doctor is not available for walk-ins at this time."}
                                            </CardDescription>
                                        </div>
                                      </CardHeader>
                                      {walkInEstimate && (
                                        <CardContent className="p-4 pt-0">
                                            {isCalculatingEstimate ? (
                                                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculating wait time...</div>
                                            ) : (
                                                <div className="flex items-center justify-around text-center">
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">Est. Time</p>
                                                        <p className="font-bold text-lg">~{format(walkInEstimate.estimatedTime, 'hh:mm a')}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-muted-foreground">Queue</p>
                                                        <p className="font-bold text-lg">{walkInEstimate.patientsAhead} ahead</p>
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                      )}
                                  </Card>
                                )}
                              </div>
                              <div className="space-y-4 md:col-span-1">
                                <h3 className="text-lg font-medium border-b pb-2">Doctor & Time</h3>
                                <FormField control={form.control} name="doctor" render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Doctor</FormLabel>
                                    <Select onValueChange={onDoctorChange} defaultValue={doctors.length > 0 ? doctors[0].id : ""} value={field.value}>
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
                                {appointmentType === 'Advanced Booking' && selectedDoctor && selectedDate && (
                                    <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
                                        {sessionSlots.length > 0 ? (
                                            sessionSlots.map((session, index) => (
                                                <div key={index}>
                                                    <h4 className="text-sm font-semibold mb-2">{session.title}</h4>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {session.slots.map(slot => (
                                                            <Button
                                                                key={slot.time}
                                                                type="button"
                                                                variant={form.getValues("time") === format(parseDateFns(slot.time, "hh:mm a", new Date()), 'HH:mm') ? "default" : "outline"}
                                                                onClick={() => {
                                                                    const val = format(parseDateFns(slot.time, "hh:mm a", new Date()), 'HH:mm');
                                                                    form.setValue("time", val);
                                                                    if (val) form.clearErrors("time");
                                                                }}
                                                                disabled={slot.status !== 'available'}
                                                                className={cn("text-xs", {
                                                                    "line-through bg-muted text-muted-foreground": slot.status === 'booked',
                                                                    "line-through bg-destructive/20 text-destructive-foreground": slot.status === 'leave',
                                                                })}
                                                            >
                                                                {slot.time}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        ) : <p className="text-sm text-muted-foreground col-span-2">No available slots for this day.</p>}
                                    </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end items-center pt-4">
                            <div className="flex justify-end gap-2">
                              {isEditing && <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>}
                              <Button type="submit" disabled={isPending || (appointmentType === 'Walk-in' && !walkInEstimate)}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {isEditing ? "Save Changes" : "Book Appointment"}
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </main>
            <div className="flex items-center justify-center">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDrawerExpanded(!isDrawerExpanded);
                }}
              >
                {isDrawerExpanded ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </Button>
            </div>
            <div className="h-full w-full">
              <div className={cn("h-full w-full", isDrawerExpanded ? "p-0" : "p-4")}>
                <Card className="h-full rounded-2xl">
                  <CardHeader className={cn("border-b", isDrawerExpanded ? "p-4" : "p-4 space-y-3")}>
                    {isDrawerExpanded ? (
                      <>
                        <div className="flex items-center justify-between">
                          <CardTitle>Appointment Details</CardTitle>
                          <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList>
                              <TabsTrigger value="all">All</TabsTrigger>
                              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                              <TabsTrigger value="completed">Completed</TabsTrigger>
                              <TabsTrigger value="no-show">No-show</TabsTrigger>
                            </TabsList>
                          </Tabs>
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
                        </div>
                      </>
                    ) : (
                      <>
                        <CardTitle>Today's Appointments</CardTitle>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="search"
                            placeholder="Search by patient, doctor..."
                            className="w-full rounded-lg bg-background pl-8 h-9"
                            value={drawerSearchTerm}
                            onChange={(e) => setDrawerSearchTerm(e.target.value)}
                          />
                        </div>
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                          <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                            <TabsTrigger value="completed">Completed</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </>
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[calc(100vh-15rem)]">
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
                              <TableRow key={appointment.id} className={cn(
                                isAppointmentOnLeave(appointment) && "bg-red-100 dark:bg-red-900/30",
                                appointment.isSkipped && "bg-orange-100 dark:bg-orange-900/30"
                              )}>
                                <TableCell className="font-medium">{appointment.patientName}</TableCell>
                                <TableCell>{appointment.age}</TableCell>
                                <TableCell>{appointment.sex}</TableCell>
                                <TableCell>{appointment.communicationPhone}</TableCell>
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
                            {todaysAppointments
                              .filter(apt => activeTab === 'upcoming' ? (apt.status === 'Confirmed' || apt.status === 'Pending') : apt.status === 'Completed')
                              .map((appointment) => (
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
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
      {primaryPatient && (
        <AddRelativeDialog
          isOpen={isAddRelativeDialogOpen}
          setIsOpen={setIsAddRelativeDialogOpen}
          primaryMemberId={primaryPatient.id}
          onRelativeAdded={handleNewRelativeAdded}
        />
      )}
      <Dialog open={isTokenModalOpen} onOpenChange={setIsTokenModalOpen}>
        <DialogContent className="sm:max-w-xs w-[90%] text-center p-6 sm:p-8">
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-6 w-6 text-muted-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
          <div className="flex flex-col items-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold">Walk-in Token Generated!</h2>
              <p className="text-muted-foreground text-sm">Please wait for your turn. You can monitor the live queue.</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Your Token Number</p>
              <p className="text-5xl font-bold text-primary">{generatedToken}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <WeeklyDoctorAvailability />
    </>
  );
}



    

    

    

    