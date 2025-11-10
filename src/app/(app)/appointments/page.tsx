
"use client";

import { useEffect, useState, useMemo, useRef, useCallback, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import type { Appointment, Doctor, Patient, User } from "@/lib/types";
import { collection, getDocs, setDoc, doc, query, where, getDoc as getFirestoreDoc, updateDoc, increment, arrayUnion, deleteDoc, writeBatch, serverTimestamp, addDoc, orderBy, onSnapshot, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { parse, isSameDay, parse as parseDateFns, format, getDay, isPast, isFuture, isToday, startOfYear, endOfYear, addMinutes, isBefore, subMinutes, isAfter, startOfDay, addHours, differenceInMinutes } from "date-fns";
import { updateAppointmentAndDoctorStatuses } from "@/lib/status-update-service";
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
import { ChevronLeft, FileDown, Printer, Search, MoreHorizontal, Eye, Edit, Trash2, ChevronRight, Stethoscope, Phone, Footprints, Loader2, Link as LinkIcon, Crown, UserCheck, UserPlus, Users, Plus, X, Clock, Calendar as CalendarLucide, CheckCircle2, Info, Send, MessageSquare, Smartphone, Hourglass, Repeat } from "lucide-react";
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
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/firebase";
import { useSearchParams } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AddRelativeDialog } from "@/components/patients/add-relative-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { FirestorePermissionError } from "@/firebase/errors";
import { errorEmitter } from "@/firebase/error-emitter";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateWalkInDetails, calculateSkippedTokenRejoinSlot, generateNextTokenAndReserveSlot } from '@/lib/appointment-service';
import { sendAppointmentCancelledNotification, sendTokenCalledNotification, sendAppointmentBookedByStaffNotification } from '@/lib/notification-service';
import { computeQueues, type QueueState } from '@/lib/queue-management-service';

const formSchema = z.object({
  id: z.string().optional(),
  patientName: z.string()
    .min(3, { message: "Name must be at least 3 characters." })
    .regex(/^[a-zA-Z\s]+$/, { message: "Name must contain only alphabets and spaces." })
    .refine(name => !name.startsWith(' ') && !name.endsWith(' ') && !name.includes('  '), { 
      message: "Spaces are only allowed between letters, not at the start, end, or multiple consecutive spaces."
    }),
  sex: z.enum(["Male", "Female", "Other"], { required_error: "Please select a gender." }),
  phone: z.string()
    .refine((val) => {
      if (!val || val.length === 0) return false; // Phone is required
      // Strip +91 prefix if present, then check for exactly 10 digits
      const cleaned = val.replace(/^\+91/, '').replace(/\D/g, ''); // Remove +91 and non-digits
      if (cleaned.length === 0) return false; // If all digits removed, invalid
      if (cleaned.length < 10) return false; // Less than 10 digits is invalid
      if (cleaned.length > 10) return false; // More than 10 digits is invalid
      return /^\d{10}$/.test(cleaned);
    }, { 
      message: "Phone number must be exactly 10 digits."
    }),
  age: z.coerce.number()
    .min(1, { message: "Age must be a positive number above zero." })
    .max(120, { message: "Age must be less than 120." }),
  doctor: z.string().min(1, { message: "Please select a doctor." }),
  department: z.string().min(1, { message: "Department is required." }),
  date: z.date().optional(),
  time: z.string().optional(),
  place: z.string().min(2, { message: "Location is required." }),
  bookedVia: z.enum(["Advanced Booking", "Walk-in"]),
  tokenNumber: z.string().optional(),
  patientId: z.string().optional(),
}).refine(data => {
    if (data.bookedVia === 'Advanced Booking') {
        return !!data.date && !!data.time;
    }
    return true;
}, {
    message: "Date and time are required for advanced bookings.",
    path: ["time"],
});

type AppointmentFormValues = z.infer<typeof formSchema>;

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_VISIBLE_SLOTS = 6;

type WalkInEstimate = {
  estimatedTime: Date;
  patientsAhead: number;
  numericToken: number;
  slotIndex: number;
  sessionIndex: number;
  delayMinutes?: number;
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
  const [hasSelectedOption, setHasSelectedOption] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSendingLink, setIsSendingLink] = useState(false);
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
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [appointmentToAddToQueue, setAppointmentToAddToQueue] = useState<Appointment | null>(null);
  const [appointmentToComplete, setAppointmentToComplete] = useState<Appointment | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showVisualView, setShowVisualView] = useState(false);
  
  const [linkChannel, setLinkChannel] = useState<'sms' | 'whatsapp'>('sms');

  // Update current time every minute
  useEffect(() => {
    const timerId = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timerId);
  }, []);

  // Check if Confirm Arrival button should be shown (disappears 5 minutes before appointment)
  const shouldShowConfirmArrival = useCallback((appointment: Appointment): boolean => {
    if (appointment.status !== 'Pending') return false;
    
    try {
      const appointmentDate = parse(appointment.date, 'd MMMM yyyy', new Date());
      const appointmentTime = parseTime(appointment.time, appointmentDate);
      const confirmDeadline = subMinutes(appointmentTime, 15); // 15 minutes before appointment (cut-off time)
      // Show button if current time is before the deadline (15 minutes before appointment)
      return isBefore(currentTime, confirmDeadline);
    } catch {
      return false;
    }
  }, [currentTime]);

  const { toast } = useToast();
  const isEditing = !!editingAppointment;

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      patientName: "",
      phone: "",
      age: undefined,
      sex: undefined,
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
        const { getDocs, query, collection, where, limit } = await import('firebase/firestore');
        const patientsRef = collection(db, 'patients');
        const fullPhoneNumber = `+91${phone}`;
        
        const primaryQuery = query(patientsRef, where('phone', '==', fullPhoneNumber), limit(1));
        const primarySnapshot = await getDocs(primaryQuery);

        if (primarySnapshot.empty) {
            setPatientSearchResults([]);
            setIsPatientPopoverOpen(false);
            form.setValue('phone', phone);
            return;
        }

        const primaryDoc = primarySnapshot.docs[0];
        const primaryPatientData = { id: primaryDoc.id, ...primaryDoc.data() } as Patient;
        primaryPatientData.isKloqoMember = primaryPatientData.clinicIds?.includes(clinicId);
        
        setPatientSearchResults([primaryPatientData]);
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
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const fetchClinicInfo = async () => {
        try {
            const userDoc = await getFirestoreDoc(doc(db, "users", auth.currentUser!.uid));
            const userClinicId = userDoc.data()?.clinicId;
            
            if (!userClinicId) {
                toast({ variant: "destructive", title: "Error", description: "No clinic associated with this user." });
                setLoading(false);
                return null;
            }
            
            setClinicId(userClinicId);
            
            const clinicDoc = await getFirestoreDoc(doc(db, 'clinics', userClinicId));
            if (clinicDoc.exists()) {
                setClinicDetails(clinicDoc.data());
            }
            return userClinicId;
        } catch (error) {
            console.error("Error fetching clinic info:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to load clinic details." });
            setLoading(false);
            return null;
        }
    };

    fetchClinicInfo().then(async (fetchedClinicId) => {
        if (!fetchedClinicId) return;

        // Update appointment and doctor statuses on page refresh
        try {
            console.log('Starting status update for clinic:', fetchedClinicId);
            console.log('Current time:', new Date().toISOString());
            console.log('Current day:', format(new Date(), 'EEEE'));
            console.log('Current time formatted:', format(new Date(), 'HH:mm'));
            await updateAppointmentAndDoctorStatuses(fetchedClinicId);
            console.log('Status update completed successfully');
        } catch (error) {
            console.error('Error updating statuses on page refresh:', error);
            // Don't show error toast as this is a background operation
        }

        setLoading(true);

        const appointmentsQuery = query(collection(db, "appointments"), where("clinicId", "==", fetchedClinicId));
        const appointmentsUnsubscribe = onSnapshot(appointmentsQuery, (snapshot) => {
            const appointmentsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
            
            // Deduplicate appointments by id
            const uniqueAppointments = appointmentsList.reduce((acc, current) => {
                const existingIndex = acc.findIndex(item => item.id === current.id);
                if (existingIndex === -1) {
                    acc.push(current);
                } else {
                    // If duplicate found, keep the latest one
                    acc[existingIndex] = current;
                }
                return acc;
            }, [] as Appointment[]);
            
            setAppointments(uniqueAppointments);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching appointments:", error);
            if (!(error instanceof FirestorePermissionError)) {
                toast({ variant: "destructive", title: "Error", description: "Failed to load appointments." });
            }
            setLoading(false);
        });

        const doctorsQuery = query(collection(db, "doctors"), where("clinicId", "==", fetchedClinicId));
        const doctorsUnsubscribe = onSnapshot(doctorsQuery, (snapshot) => {
            const doctorsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
            setDoctors(doctorsList);
            if (doctorsList.length > 0 && !form.getValues('doctor')) {
                const firstDoctor = doctorsList[0];
                form.setValue("doctor", firstDoctor.id, { shouldValidate: true });
                form.setValue("department", firstDoctor.department || "", { shouldValidate: true });
            }
        }, (error) => {
            console.error("Error fetching doctors:", error);
             if (!(error instanceof FirestorePermissionError)) {
                toast({ variant: "destructive", title: "Error", description: "Failed to load doctors." });
            }
        });

        // Cleanup function
        return () => {
            appointmentsUnsubscribe();
            doctorsUnsubscribe();
        };
    });

  }, [auth.currentUser, toast, form]);


  const resetForm = useCallback(() => {
    setEditingAppointment(null);
    setPatientSearchTerm("");
    setSelectedPatient(null);
    setPrimaryPatient(null);
    setRelatives([]);
    setBookingFor('member');
    setHasSelectedOption(false);
    form.reset({
      patientName: "",
      phone: "",
      age: undefined,
      sex: undefined,
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
              setPatientSearchTerm(patientData.communicationPhone?.replace('+91', '') || '');
              form.setValue('phone', patientData.communicationPhone?.replace('+91', '') || '');
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

  const watchedDoctorId = useWatch({
    control: form.control,
    name: "doctor"
  });

  const selectedDoctor = useMemo(() => {
    if (!watchedDoctorId) return doctors.length > 0 ? doctors[0] : null;
    return doctors.find(d => d.id === watchedDoctorId) || null;
  }, [doctors, watchedDoctorId]);

  const selectedDate = form.watch("date");
  const appointmentType = form.watch("bookedVia");


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
    if (appointmentType !== 'Walk-in' || !selectedDoctor || !selectedDoctor.availabilitySlots) return false;
    
    const now = new Date();
    const todayStr = format(now, 'EEEE');
    const todaySlots = selectedDoctor.availabilitySlots.find(s => s.day === todayStr);
    if (!todaySlots || !todaySlots.timeSlots.length) return false;

    const getTimeOnDate = (timeStr: string, date: Date) => {
      const newDate = new Date(date);
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      newDate.setHours(hours, minutes, 0, 0);
      return newDate;
    };

    // Get first session start time
    const firstSessionStart = getTimeOnDate(todaySlots.timeSlots[0].from, now);
    // Get last session end time
    const lastSessionEnd = getTimeOnDate(todaySlots.timeSlots[todaySlots.timeSlots.length - 1].to, now);
    
    // Walk-in opens 2 hours before the first session starts
    const walkInOpenTime = subMinutes(firstSessionStart, 120);
    // Walk-in closes 15 minutes before consultation end
    const walkInCloseTime = subMinutes(lastSessionEnd, 15);
    
    // Check if current time is within walk-in window
    return now >= walkInOpenTime && now <= walkInCloseTime;
  }, [appointmentType, selectedDoctor]);

  useEffect(() => {
    if (appointmentType === 'Walk-in' && selectedDoctor && isWalkInAvailable) {
      setIsCalculatingEstimate(true);
      const allotment = clinicDetails?.walkInTokenAllotment || 3;
      calculateWalkInDetails(clinicId ?? selectedDoctor.clinicId, selectedDoctor.name, selectedDoctor, allotment).then(details => {
        setWalkInEstimate(details);
        setIsCalculatingEstimate(false);
      }).catch(err => {
        console.error("Error calculating walk-in details:", err);
        setWalkInEstimate(null);
        setIsCalculatingEstimate(false);
        toast({
          variant: "destructive",
          title: "Walk-in Unavailable",
          description: err.message || "Could not calculate walk-in estimate.",
        });
      });
    } else {
      setWalkInEstimate(null);
    }
  }, [appointmentType, selectedDoctor, isWalkInAvailable, clinicDetails, toast]);

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
        
        const communicationPhone = `+91${form.getValues('phone')}`;
        
        const patientDataToUpdate: any = {
          name: values.patientName,
          place: values.place,
          phone: values.phone ? `+91${values.phone}` : "",
          communicationPhone: communicationPhone,
        };
        
        // Only add age and sex if they have values (Firestore doesn't allow undefined)
        if (values.age !== undefined && values.age !== null) {
          patientDataToUpdate.age = values.age;
        }
        if (values.sex) {
          patientDataToUpdate.sex = values.sex;
        }

        if (isEditing && editingAppointment) {
          patientForAppointmentId = editingAppointment.patientId;
          const patientRef = doc(db, 'patients', patientForAppointmentId);
          // Get the existing patient to check if they have a phone
          const existingPatientSnap = await getFirestoreDoc(patientRef);
          const existingPatient = existingPatientSnap.exists() ? existingPatientSnap.data() as Patient : null;
          
          const updateData: any = {
            name: patientDataToUpdate.name,
            place: patientDataToUpdate.place,
            communicationPhone: patientDataToUpdate.communicationPhone,
            updatedAt: serverTimestamp()
          };
          
          // Only add age and sex if they have values (Firestore doesn't allow undefined)
          if (patientDataToUpdate.age !== undefined && patientDataToUpdate.age !== null) {
            updateData.age = patientDataToUpdate.age;
          }
          if (patientDataToUpdate.sex) {
            updateData.sex = patientDataToUpdate.sex;
          }
          
          // Only update phone field if patient already has a phone (not a relative without phone)
          // Preserve empty phone field for relatives
          if (existingPatient && existingPatient.phone && existingPatient.phone.trim().length > 0) {
            updateData.phone = patientDataToUpdate.phone;
          } else {
            // Relative without phone - keep phone field empty
            updateData.phone = '';
          }
          batch.update(patientRef, updateData);
          patientForAppointmentName = values.patientName;
        } else if (selectedPatient && !isEditing) {
          patientForAppointmentId = selectedPatient.id;
          const patientRef = doc(db, 'patients', patientForAppointmentId);
          const clinicIds = selectedPatient.clinicIds || [];
          const updateData: any = { 
            name: patientDataToUpdate.name,
            age: patientDataToUpdate.age,
            sex: patientDataToUpdate.sex,
            place: patientDataToUpdate.place,
            communicationPhone: patientDataToUpdate.communicationPhone,
            updatedAt: serverTimestamp() 
          };
          // Only update phone field if patient already has a phone (not a relative without phone)
          // Preserve empty phone field for relatives
          if (selectedPatient.phone && selectedPatient.phone.trim().length > 0) {
            updateData.phone = patientDataToUpdate.phone;
          } else {
            // Relative without phone - keep phone field empty
            updateData.phone = '';
          }
          if (!clinicIds.includes(clinicId)) {
            updateData.clinicIds = arrayUnion(clinicId);
          }
          batch.update(patientRef, updateData);
          patientForAppointmentName = values.patientName;
        } else {
          // Creating a new user and patient
          const usersRef = collection(db, 'users');
          
          // Clean phone: remove +91 if user entered it, remove any non-digits, then ensure exactly 10 digits
          let patientPhoneNumber = "";
          if (values.phone) {
            const cleaned = values.phone.replace(/^\+91/, '').replace(/\D/g, ''); // Remove +91 prefix and non-digits
            if (cleaned.length === 10) {
              patientPhoneNumber = `+91${cleaned}`; // Add +91 prefix when saving
            }
          }
          if (!patientPhoneNumber) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please enter a valid 10-digit phone number.'});
            return;
          }
          const userQuery = query(
              usersRef, 
              where('phone', '==', patientPhoneNumber),
              where('role', '==', 'patient')
          );
          const userSnapshot = await getDocs(userQuery);

          let userId: string;
          let patientId: string;
          const patientRef = doc(collection(db, 'patients'));
          patientId = patientRef.id;

          if (userSnapshot.empty) {
            // User does not exist, create new user and patient
            const newUserRef = doc(collection(db, 'users'));
            userId = newUserRef.id;
            
            const newUserData: User = {
                uid: userId,
                phone: patientPhoneNumber,
                role: 'patient',
                patientId: patientId,
            };
            batch.set(newUserRef, newUserData);

            const newPatientData: any = {
              id: patientId,
              primaryUserId: userId,
              ...patientDataToUpdate,
              clinicIds: [clinicId],
              visitHistory: [],
              totalAppointments: 0,
              relatedPatientIds: [],
              isPrimary: true,
              isKloqoMember: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            // Remove undefined values - Firestore doesn't allow undefined
            const cleanedPatientData = Object.fromEntries(
              Object.entries(newPatientData).filter(([_, v]) => v !== undefined)
            );
            batch.set(patientRef, cleanedPatientData);

          } else {
            // User exists, just create/update patient
            const existingUser = userSnapshot.docs[0].data() as User;
            userId = existingUser.uid;
            
            const existingPatientRef = doc(db, 'patients', existingUser.patientId!);
            const existingPatientSnap = await getFirestoreDoc(existingPatientRef);

            if (existingPatientSnap.exists()) {
                // Patient record exists, update it and ensure clinicId is present
                patientId = existingPatientSnap.id;
                const updateData: any = {
                    name: patientDataToUpdate.name,
                    place: patientDataToUpdate.place,
                    phone: patientDataToUpdate.phone,
                    communicationPhone: patientDataToUpdate.communicationPhone,
                    updatedAt: serverTimestamp()
                };
                
                // Only add age and sex if they have values (Firestore doesn't allow undefined)
                if (patientDataToUpdate.age !== undefined && patientDataToUpdate.age !== null) {
                  updateData.age = patientDataToUpdate.age;
                }
                if (patientDataToUpdate.sex) {
                  updateData.sex = patientDataToUpdate.sex;
                }
                
                if (!existingPatientSnap.data().clinicIds?.includes(clinicId)) {
                    updateData.clinicIds = arrayUnion(clinicId);
                }
                batch.update(existingPatientRef, updateData);
            } else {
                // This case is unlikely if DB is consistent, but handles it.
                // User exists but patient record is missing. Create it.
                const newPatientData: any = {
                  id: patientId,
                  primaryUserId: userId,
                  ...patientDataToUpdate,
                  clinicIds: [clinicId],
                  visitHistory: [],
                  totalAppointments: 0,
                  relatedPatientIds: [],
                  isPrimary: true,
                  isKloqoMember: false,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                };
                // Remove undefined values - Firestore doesn't allow undefined
                const cleanedPatientData = Object.fromEntries(
                  Object.entries(newPatientData).filter(([_, v]) => v !== undefined)
                );
                batch.set(patientRef, cleanedPatientData);
            }
          }

          patientForAppointmentId = patientId;
          patientForAppointmentName = values.patientName;
        }

        if (!isEditing) {
            const appointmentDateStr = appointmentType === 'Walk-in' 
                ? format(new Date(), "d MMMM yyyy")
                : format(values.date!, "d MMMM yyyy");

            const duplicateCheckQuery = query(
                collection(db, "appointments"),
                where("patientId", "==", patientForAppointmentId),
                where("doctor", "==", selectedDoctor.name),
                where("date", "==", appointmentDateStr),
                where("status", "in", ["Pending", "Confirmed", "Completed", "Skipped"])
            );

            const duplicateSnapshot = await getDocs(duplicateCheckQuery);
            if (!duplicateSnapshot.empty) {
                toast({
                    variant: "destructive",
                    title: "Duplicate Booking",
                    description: "This patient already has an appointment with this doctor today.",
                });
                return;
            }
        }


        await batch.commit().catch(e => {
          const permissionError = new FirestorePermissionError({
            path: 'batch write', operation: 'create', requestResourceData: values
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
          
          // Create appointment directly (no pool needed)
          const { tokenNumber, numericToken, slotIndex: actualSlotIndex } = await generateNextTokenAndReserveSlot(
            clinicId,
            selectedDoctor.name,
            date,
            'W',
            {
              time: format(walkInEstimate.estimatedTime, "hh:mm a"),
              slotIndex: walkInEstimate.slotIndex,
              doctorId: selectedDoctor.id,
            }
          );
          
          // Calculate cut-off time and no-show time
          const appointmentDate = parse(format(date, "d MMMM yyyy"), "d MMMM yyyy", new Date());
          const appointmentTime = walkInEstimate.estimatedTime;
          const cutOffTime = subMinutes(appointmentTime, 15);
          const noShowTime = addMinutes(appointmentTime, 15);
          
          const appointmentData: Omit<Appointment, 'id'> = {
            bookedVia: appointmentType,
            clinicId: selectedDoctor.clinicId,
            doctorId: selectedDoctor.id, // Add doctorId
            date: format(date, "d MMMM yyyy"),
            department: selectedDoctor.department,
            doctor: selectedDoctor.name,
            sex: values.sex,
            patientId: patientForAppointmentId,
            patientName: values.patientName,
            age: values.age ?? undefined,
            communicationPhone: communicationPhone,
            place: values.place,
            status: 'Confirmed', // Walk-ins are physically present at clinic
            time: format(walkInEstimate.estimatedTime, "hh:mm a"),
            tokenNumber: tokenNumber,
            numericToken: numericToken,
            slotIndex: actualSlotIndex, // Use the actual slotIndex returned from the function
            sessionIndex: walkInEstimate.sessionIndex,
            treatment: "General Consultation",
            createdAt: serverTimestamp(),
            cutOffTime: cutOffTime,
            noShowTime: noShowTime,
          };
          const appointmentRef = doc(collection(db, 'appointments'));
          await setDoc(appointmentRef, { ...appointmentData, id: appointmentRef.id });
          setAppointments(prev => [...prev, { ...appointmentData, id: appointmentRef.id }]);

          // Ensure clinicId is added to patient's clinicIds array if it doesn't exist
          if (!isEditing) {
            try {
              const patientRef = doc(db, 'patients', patientForAppointmentId);
              const patientDoc = await getFirestoreDoc(patientRef);
              if (patientDoc.exists()) {
                const patientData = patientDoc.data();
                const clinicIds = patientData?.clinicIds || [];
                if (!clinicIds.includes(clinicId)) {
                  await updateDoc(patientRef, {
                    clinicIds: arrayUnion(clinicId),
                    updatedAt: serverTimestamp(),
                  });
                }
              }
            } catch (error) {
              console.error("Error updating patient clinicIds:", error);
              // Don't fail the appointment creation if this update fails
            }
          }

          setGeneratedToken(appointmentData.tokenNumber);
          setIsTokenModalOpen(true);

        } else {
          if (!values.date || !values.time) {
            toast({ variant: "destructive", title: "Missing Information", description: "Please select a date and time for the appointment." });
            return;
          }
          const appointmentId = isEditing && editingAppointment ? editingAppointment.id : doc(collection(db, "appointments")).id;
          const appointmentDateStr = format(values.date, "d MMMM yyyy");
          const appointmentTimeStr = format(parseDateFns(values.time, "HH:mm", new Date()), "hh:mm a");

          let slotIndex = -1;
          let sessionIndex = -1;
          const dayOfWeek = daysOfWeek[getDay(values.date)];
          const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);

          // Calculate global slotIndex across all sessions (matching patient app logic)
          if (availabilityForDay) {
            let globalSlotIndex = 0;
            for (let i = 0; i < availabilityForDay.timeSlots.length; i++) {
              const session = availabilityForDay.timeSlots[i];
              let currentTime = parseDateFns(session.from, 'hh:mm a', values.date);
              const endTime = parseDateFns(session.to, 'hh:mm a', values.date);
              const slotDuration = selectedDoctor.averageConsultingTime || 15;

              while (isBefore(currentTime, endTime)) {
                if (format(currentTime, "hh:mm a") === appointmentTimeStr) {
                  slotIndex = globalSlotIndex;
                  sessionIndex = i;
                  console.log('🔍 [DEBUG] Slot calculation:', {
                    selectedTime: appointmentTimeStr,
                    calculatedSlotIndex: slotIndex,
                    currentTime: format(currentTime, "hh:mm a"),
                    globalSlotIndex
                  });
                  break;
                }
                currentTime = addMinutes(currentTime, slotDuration);
                globalSlotIndex++;
              }
              if (slotIndex !== -1) break;
            }
          }
          
          console.log('🔍 [DEBUG] Final slot calculation result:', {
            selectedTime: appointmentTimeStr,
            calculatedSlotIndex: slotIndex,
            sessionIndex
          });


          // Generate token and reserve slot atomically (for both new and rescheduled appointments)
          // For rescheduling, regenerate token using same logic as new appointment
          let tokenData: { tokenNumber: string; numericToken: number; slotIndex: number };
          try {
            tokenData = await generateNextTokenAndReserveSlot(
              clinicId,
              selectedDoctor.name,
              values.date,
              'A',
              {
                time: appointmentTimeStr,
                slotIndex,
                doctorId: selectedDoctor.id,
                existingAppointmentId: isEditing && editingAppointment ? editingAppointment.id : undefined,
              }
            );
          } catch (error: any) {
            if (error.code === 'SLOT_OCCUPIED' || error.message === 'SLOT_ALREADY_BOOKED') {
              toast({
                variant: "destructive",
                title: "Time Slot Already Booked",
                description: "This time slot was just booked by someone else. Please select another time.",
              });
              return;
            } else if (error.code === 'A_CAPACITY_REACHED') {
              toast({
                variant: "destructive",
                title: "Advance Booking Full",
                description: "Advanced bookings have reached the 85% limit for this doctor today. Please choose another day or add as a walk-in.",
              });
              return;
            }
            throw error;
          }

          // Use the slotIndex returned from generateNextTokenAndReserveSlot (may have been auto-adjusted)
          const actualSlotIndex = tokenData.slotIndex;

          // Recalculate the time from the actual slotIndex to ensure consistency
          let actualAppointmentTimeStr = appointmentTimeStr;
          let actualAppointmentTime = parseDateFns(appointmentTimeStr, "hh:mm a", values.date);
          try {
            // Generate all time slots for the day to find the correct time for the actual slotIndex
            const dayOfWeek = daysOfWeek[getDay(values.date)];
            const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);
            if (availabilityForDay) {
              const slotDuration = selectedDoctor.averageConsultingTime || 15;
              let globalSlotIndex = 0;
              let foundSlot = false;
              for (let i = 0; i < availabilityForDay.timeSlots.length && !foundSlot; i++) {
                const session = availabilityForDay.timeSlots[i];
                let currentTime = parseDateFns(session.from, 'hh:mm a', values.date);
                const endTime = parseDateFns(session.to, 'hh:mm a', values.date);
                
                while (isBefore(currentTime, endTime) && !foundSlot) {
                  if (globalSlotIndex === actualSlotIndex) {
                    actualAppointmentTime = currentTime;
                    actualAppointmentTimeStr = format(currentTime, "hh:mm a");
                    sessionIndex = i; // Update sessionIndex to match the actual slot
                    foundSlot = true;
                    break;
                  }
                  currentTime = addMinutes(currentTime, slotDuration);
                  globalSlotIndex++;
                }
              }
            }
          } catch (error) {
            console.error('Error recalculating time from slotIndex:', error);
            // Fall back to original time if recalculation fails
          }

          // Calculate cut-off time and no-show time
          let cutOffTime: Date | undefined;
          let noShowTime: Date | undefined;
          let inheritedDelay = 0;
          try {
            const appointmentDate = parse(appointmentDateStr, "d MMMM yyyy", new Date());
            const appointmentTime = parseDateFns(actualAppointmentTimeStr, "hh:mm a", appointmentDate); // Use recalculated time
            cutOffTime = subMinutes(appointmentTime, 15);
            
            // Inherit delay from previous appointment (if any)
            // Find the appointment with the highest slotIndex that is less than actualSlotIndex
            const appointmentsRef = collection(db, 'appointments');
            const appointmentsQuery = query(
              appointmentsRef,
              where('clinicId', '==', clinicId),
              where('doctor', '==', selectedDoctor.name),
              where('date', '==', appointmentDateStr)
            );
            const appointmentsSnapshot = await getDocs(appointmentsQuery);
            const allAppointments = appointmentsSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as Array<Appointment & { id: string }>;
            
            // Find the previous appointment (highest slotIndex < actualSlotIndex)
            const previousAppointments = allAppointments
              .filter(a => {
                const aptSlotIndex = a.slotIndex ?? -1;
                return aptSlotIndex >= 0 && aptSlotIndex < actualSlotIndex;
              })
              .sort((a, b) => (b.slotIndex ?? 0) - (a.slotIndex ?? 0));
            
            if (previousAppointments.length > 0) {
              const previousAppointment = previousAppointments[0];
              inheritedDelay = previousAppointment.delay || 0;
            }
            
            // Apply delay to noShowTime only (not to cutOffTime or time)
            // cutOffTime remains: appointment time - 15 minutes (no delay)
            // noShowTime becomes: appointment time + 15 minutes + delay
            noShowTime = addMinutes(appointmentTime, 15 + inheritedDelay);
          } catch (error) {
            console.error('Error calculating cut-off and no-show times:', error);
          }
          
          const appointmentData: Appointment = {
            id: appointmentId,
            clinicId: clinicId,
            patientId: patientForAppointmentId,
            patientName: patientForAppointmentName,
            sex: values.sex,
            communicationPhone: communicationPhone,
            age: values.age ?? undefined,
            doctorId: selectedDoctor.id, // Add doctorId
            doctor: selectedDoctor.name,
            date: appointmentDateStr,
            time: actualAppointmentTimeStr, // Use the recalculated time from actual slotIndex
            department: values.department,
            status: isEditing ? editingAppointment!.status : "Pending",
            treatment: "General Consultation",
            tokenNumber: tokenData.tokenNumber,
            numericToken: tokenData.numericToken,
            bookedVia: values.bookedVia,
            place: values.place,
            slotIndex: actualSlotIndex, // Use the actual slotIndex returned from the function
            sessionIndex: sessionIndex,
            createdAt: isEditing ? editingAppointment.createdAt : serverTimestamp(),
            cutOffTime: cutOffTime,
            noShowTime: noShowTime,
            ...(inheritedDelay > 0 && { delay: inheritedDelay }), // Only include delay if > 0
          };

          const appointmentRef = doc(db, 'appointments', appointmentId);
          await setDoc(appointmentRef, appointmentData, { merge: true });

          if (!isEditing) {
            const patientRef = doc(db, 'patients', patientForAppointmentId);
            const patientDoc = await getFirestoreDoc(patientRef);
            const updateData: any = {
              visitHistory: arrayUnion(appointmentId),
              totalAppointments: increment(1),
              updatedAt: serverTimestamp(),
            };
            
            // Ensure clinicId is added to patient's clinicIds array if it doesn't exist
            if (patientDoc.exists()) {
              const patientData = patientDoc.data();
              const clinicIds = patientData?.clinicIds || [];
              if (!clinicIds.includes(clinicId)) {
                updateData.clinicIds = arrayUnion(clinicId);
              }
            }
            
            await updateDoc(patientRef, updateData);
          }

          // Send notification for new appointments
          if (!isEditing) {
            console.log('🎯 DEBUG: Sending notification for new appointment');
            try {
              const clinicName = `The clinic`; // You can fetch from clinic doc if needed
              
              await sendAppointmentBookedByStaffNotification({
                firestore: db,
                patientId: patientForAppointmentId,
                appointmentId: appointmentId,
                doctorName: appointmentData.doctor,
                clinicName: clinicName,
                date: appointmentData.date,
                time: appointmentData.time,
                tokenNumber: appointmentData.tokenNumber,
                bookedBy: 'admin',
              });
              console.log('🎯 DEBUG: Notification sent to patient');
            } catch (notifError) {
              console.error('🎯 DEBUG: Failed to send notification:', notifError);
            }
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
    if (!patientSearchTerm || !clinicId || patientSearchTerm.length !== 10) {
        toast({ variant: "destructive", title: "Invalid Phone Number", description: "Please enter a 10-digit phone number to send a link." });
        return;
    }
    const fullPhoneNumber = `+91${patientSearchTerm}`;

    setIsSendingLink(true);
    try {
        const usersRef = collection(db, 'users');
        const userQuery = query(
            usersRef, 
            where('phone', '==', fullPhoneNumber),
            where('role', '==', 'patient')
        );
        
        const userSnapshot = await getDocs(userQuery).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: 'users',
                operation: 'list',
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });

        // Check if user already exists
        if (!userSnapshot.empty) {
            // User exists, check if patient exists and add clinicId to clinicIds array
            const existingUser = userSnapshot.docs[0].data() as User;
            const patientId = existingUser.patientId;
            
            if (patientId) {
                const patientRef = doc(db, 'patients', patientId);
                const patientDoc = await getFirestoreDoc(patientRef);
                
                if (patientDoc.exists()) {
                    const patientData = patientDoc.data() as Patient;
                    const clinicIds = patientData.clinicIds || [];
                    
                    // Only update if clinicId is not already in the array
                    if (!clinicIds.includes(clinicId)) {
                        await updateDoc(patientRef, {
                            clinicIds: arrayUnion(clinicId),
                            updatedAt: serverTimestamp(),
                        }).catch(async (serverError) => {
                            console.error("Error updating patient clinicIds:", serverError);
                            // Continue with sending link even if update fails
                        });
                    }
                }
            }
            console.log("User already exists, sending booking link");
        } else {
            // User doesn't exist, create new user and patient records
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
                communicationPhone: fullPhoneNumber,
                name: "",
                place: "",
                email: "",
                clinicIds: [clinicId],
                totalAppointments: 0,
                visitHistory: [],
                relatedPatientIds: [],
                isPrimary: true,
                isKloqoMember: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            // Remove undefined values - Firestore doesn't allow undefined
            const cleanedPatientData = Object.fromEntries(
                Object.entries(newPatientData).filter(([_, v]) => v !== undefined)
            ) as Partial<Patient>;
            batch.set(newPatientRef, cleanedPatientData);

            await batch.commit().catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: 'users or patients',
                operation: 'create',
                requestResourceData: { user: newUserData, patient: newPatientData }
            });
                errorEmitter.emit('permission-error', permissionError);
                throw serverError;
            });
        }

        // Send SMS with booking link
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.kloqo.com';
        const clinicName = clinicDetails?.name || 'the clinic';
        const bookingLink = `${baseUrl}/clinics/${clinicId}`;
        const message = `Your request for appointment is received in '${clinicName}'. Use this link to complete the booking: ${bookingLink}`;
        
        try {
            const response = await fetch('/api/send-sms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: fullPhoneNumber,
                    message: message,
                    channel: linkChannel
                }),
            });

            const result = await response.json();

            if (result.success) {
                const isNewUser = userSnapshot.empty;
                toast({
                    title: "Link Sent Successfully",
                    description: `A booking link has been sent to ${fullPhoneNumber}.${isNewUser ? ' New user and patient records created.' : ''}`
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Failed to Send Link",
                    description: result.error || "Could not send the booking link."
                });
            }
        } catch (smsError) {
            console.error("Error sending SMS:", smsError);
            const isNewUser = userSnapshot.empty;
            toast({
                title: isNewUser ? "Records Created" : "SMS Failed",
                description: isNewUser 
                    ? `User and patient records created, but failed to send SMS to ${fullPhoneNumber}.`
                    : `Failed to send SMS to ${fullPhoneNumber}.`
            });
        }

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
        setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'Cancelled' as const } : a));
        
        // Send cancellation notification
        try {
            const clinicDoc = await getFirestoreDoc(doc(db, 'clinics', appointment.clinicId));
            const clinicName = clinicDoc.data()?.name || 'The clinic';
            
            await sendAppointmentCancelledNotification({
                firestore: db,
                patientId: appointment.patientId,
                appointmentId: appointment.id,
                doctorName: appointment.doctor,
                clinicName,
                date: appointment.date,
                time: appointment.time,
                cancelledBy: 'clinic',
            });
            console.log('Appointment cancelled notification sent');
        } catch (notifError) {
            console.error('Failed to send cancellation notification:', notifError);
            // Don't fail the cancellation if notification fails
        }
        
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
        const appointmentDoctor = doctors.find(d => d.name === appointment.doctor);
        const now = new Date();
        
        // Calculate delay if consultation took longer than average time
        let delayMinutes = 0;
        if (appointmentDoctor) {
          try {
            const { parseTime } = await import('@/lib/utils');
            const appointmentDate = parse(appointment.date, 'd MMMM yyyy', new Date());
            const appointmentTime = parseTime(appointment.time, appointmentDate);
            const averageConsultingTime = appointmentDoctor.averageConsultingTime || 15;
            
            // Calculate actual consultation duration (from appointment time to now)
            const actualDuration = differenceInMinutes(now, appointmentTime);
            
            // If actual duration exceeds average time, calculate delay
            if (actualDuration > averageConsultingTime) {
              delayMinutes = actualDuration - averageConsultingTime;
            }
          } catch (delayCalcError) {
            console.error('Error calculating delay:', delayCalcError);
            // Don't fail the completion if delay calculation fails
          }
        }
        
        await updateDoc(appointmentRef, { 
          status: 'Completed',
          completedAt: serverTimestamp()
        });
        setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'Completed' as const } : a));
        
        // Increment consultation counter
        try {
          if (appointmentDoctor && appointment.sessionIndex !== undefined) {
            const { incrementConsultationCounter } = await import('@/lib/queue-management-service');
            await incrementConsultationCounter(
              appointment.clinicId,
              appointmentDoctor.id,
              appointment.date,
              appointment.sessionIndex
            );
          }
        } catch (counterError) {
          console.error('Error incrementing consultation counter:', counterError);
          // Don't fail the completion if counter update fails
        }
        
        // Send token called notification
        try {
            const clinicDoc = await getFirestoreDoc(doc(db, 'clinics', appointment.clinicId));
            const clinicName = clinicDoc.data()?.name || 'The clinic';
            
            await sendTokenCalledNotification({
                firestore: db,
                patientId: appointment.patientId,
                appointmentId: appointment.id,
                clinicName,
                tokenNumber: appointment.tokenNumber,
                doctorName: appointment.doctor,
            });
            console.log('Token called notification sent');
        } catch (notifError) {
            console.error('Failed to send token called notification:', notifError);
            // Don't fail the completion if notification fails
        }
        
        toast({ 
          title: "Appointment Marked as Completed",
          description: delayMinutes > 0 ? `Consultation exceeded the average by ${delayMinutes} minute${delayMinutes === 1 ? "" : "s"}.` : undefined
        });
      } catch (error) {
        console.error("Error completing appointment:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to mark as completed." });
      }
    });
  };

  const handleSkip = async (appointment: Appointment) => {
    startTransition(async () => {
      try {
        const skippedSlotIndex = appointment.slotIndex ?? -1;
        if (skippedSlotIndex < 0) {
          throw new Error('Invalid appointment slot index');
        }

        const appointmentRef = doc(db, "appointments", appointment.id);
        const todayStr = format(new Date(), 'd MMMM yyyy');

        // Find all appointments with slotIndex > skippedSlotIndex that need to be shifted backwards
        const appointmentsToShift = appointments.filter(a => {
          const slotIdx = a.slotIndex ?? -1;
          return slotIdx > skippedSlotIndex && 
                 a.doctor === appointment.doctor &&
                 a.date === todayStr &&
                 (a.status === 'Pending' || a.status === 'Confirmed');
        });

        // Step 1: Mark as skipped with timestamp
        await updateDoc(appointmentRef, { 
          status: 'Skipped',
          skippedAt: serverTimestamp()
        });

        // Step 2: Shift subsequent appointments backwards (slotIndex - 1) using batch
        if (appointmentsToShift.length > 0) {
          const batch = writeBatch(db);
          for (const apt of appointmentsToShift) {
            const aptRef = doc(db, 'appointments', apt.id);
            batch.update(aptRef, {
              slotIndex: (apt.slotIndex ?? 0) - 1,
              updatedAt: serverTimestamp()
            });
          }
          await batch.commit();
        }

        // Step 3: Update local state
        setAppointments(prev => {
          const updated = prev.map(a => {
            if (a.id === appointment.id) {
              return { ...a, status: 'Skipped' as const };
            }
            // Shift subsequent appointments backwards
            if (a.slotIndex && a.slotIndex > skippedSlotIndex && 
                a.doctor === appointment.doctor &&
                a.date === todayStr &&
                (a.status === 'Pending' || a.status === 'Confirmed')) {
              return { ...a, slotIndex: (a.slotIndex ?? 0) - 1 };
            }
            return a;
          });
          return [
            ...updated.filter(a => a.status !== 'Skipped'),
            ...updated.filter(a => a.status === 'Skipped'),
          ] as Appointment[];
        });

        toast({ title: "Appointment Skipped", description: "Subsequent appointments have been shifted backwards to fill the gap." });
      } catch (error) {
        console.error("Error skipping appointment:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to skip appointment." });
      }
    });
  };

  const handleAddToQueue = async (appointment: Appointment) => {
    // Only process if status is still 'Pending'
    if (appointment.status !== 'Pending') {
      toast({ 
        variant: "destructive", 
        title: "Cannot Add to Queue", 
        description: "This appointment is no longer in Pending status." 
      });
      return;
    }

    startTransition(async () => {
      try {
        const appointmentRef = doc(db, "appointments", appointment.id);
        await updateDoc(appointmentRef, { 
          status: 'Confirmed'
        });
        
        setAppointments(prev => prev.map(a => 
          a.id === appointment.id ? { ...a, status: 'Confirmed' as const } : a
        ));
        
        toast({ 
          title: "Patient Added to Queue", 
          description: `${appointment.patientName} has been confirmed and added to the queue.`
        });
      } catch (error) {
        console.error("Error adding to queue:", error);
        toast({ 
          variant: "destructive", 
          title: "Error", 
          description: "Failed to add patient to queue." 
        });
      }
    });
  };

  const handleRejoinQueue = (appointment: Appointment) => {
    startTransition(async () => {
      if (!clinicId) return;
  
      // Find the doctor from the appointment
      const appointmentDoctor = doctors.find(d => d.name === appointment.doctor);
      if (!appointmentDoctor) {
        toast({ 
          variant: "destructive", 
          title: "Error", 
          description: "Doctor not found for this appointment." 
        });
        return;
      }
  
      const recurrence = clinicDetails?.skippedTokenRecurrence || 3;
      const today = new Date();
      const todayStr = format(today, 'd MMMM yyyy');
      
      // Get today's active appointments for the same doctor
      const activeAppointments = appointments
        .filter(a =>
          a.doctor === appointment.doctor &&
          a.date === todayStr &&
          (a.status === 'Pending' || a.status === 'Confirmed')
        );

      try {
        // Calculate slot-based rejoin position
        const rejoinDetails = await calculateSkippedTokenRejoinSlot(
          appointment,
          activeAppointments,
          appointmentDoctor,
          recurrence,
          today
        );

        const targetSlotIndex = rejoinDetails.slotIndex;

        // Find all appointments with slotIndex >= targetSlotIndex that need to be shifted forwards
        const appointmentsToShift = appointments.filter(a => {
          const slotIdx = a.slotIndex ?? -1;
          return slotIdx >= targetSlotIndex && 
                 a.id !== appointment.id && // Exclude the skipped appointment itself
                 a.doctor === appointment.doctor &&
                 a.date === todayStr &&
                 (a.status === 'Pending' || a.status === 'Confirmed');
        });

        // Use transaction to atomically shift appointments and update skipped appointment
        await runTransaction(db, async (transaction) => {
          // STEP 1: Read all documents first (Firestore requires all reads before writes)
          const appointmentRefs = appointmentsToShift.map(apt => ({
            ref: doc(db, 'appointments', apt.id),
            apt
          }));
          const skippedAppointmentRef = doc(db, 'appointments', appointment.id);
          
          // Read all documents that will be updated
          const appointmentDocs = await Promise.all(
            appointmentRefs.map(async ({ ref }) => await transaction.get(ref))
          );
          const skippedAppointmentDoc = await transaction.get(skippedAppointmentRef);
          
          // STEP 2: Now perform all writes after all reads
          // First, shift subsequent appointments forwards (slotIndex + 1)
          for (let i = 0; i < appointmentRefs.length; i++) {
            const { ref, apt } = appointmentRefs[i];
            const aptDoc = appointmentDocs[i];
            if (aptDoc.exists()) {
              transaction.update(ref, {
                slotIndex: (apt.slotIndex ?? 0) + 1,
                updatedAt: serverTimestamp()
              });
            }
          }

          // Then, update skipped appointment
          if (skippedAppointmentDoc.exists()) {
            transaction.update(skippedAppointmentRef, {
              status: 'Confirmed',
              slotIndex: targetSlotIndex,
              time: rejoinDetails.time,
              sessionIndex: rejoinDetails.sessionIndex,
              updatedAt: serverTimestamp()
            });
          }
        });

        // Update local state
        setAppointments(prev => {
          const updated = prev.map(a => {
            if (a.id === appointment.id) {
              return { 
                ...a, 
                status: 'Confirmed' as const,
                slotIndex: targetSlotIndex,
                time: rejoinDetails.time,
                sessionIndex: rejoinDetails.sessionIndex
              };
            }
            // Shift subsequent appointments forwards
            if (a.slotIndex && a.slotIndex >= targetSlotIndex &&
                a.id !== appointment.id &&
                a.doctor === appointment.doctor &&
                a.date === todayStr &&
                (a.status === 'Pending' || a.status === 'Confirmed')) {
              return { ...a, slotIndex: (a.slotIndex ?? 0) + 1 };
            }
            return a;
          });
          return updated.sort((a, b) => {
            const slotA = a.slotIndex ?? Infinity;
            const slotB = b.slotIndex ?? Infinity;
            return slotA - slotB;
          });
        });

        toast({
          title: "Patient Re-joined Queue",
          description: `${appointment.patientName} has been added back to the queue at position after ${recurrence} patient(s). Subsequent appointments have been shifted forwards.`
        });
      } catch (error: any) {
        console.error("Error re-joining queue:", error);
        const errorMessage = error?.message || "Could not re-join the patient to the queue.";
        toast({ 
          variant: "destructive", 
          title: "Error", 
          description: errorMessage 
        });
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
    setHasSelectedOption(true);

    const capitalizedSex = patient.sex ? (patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1).toLowerCase()) : undefined;

    form.reset({
      ...form.getValues(),
      patientId: patient.id,
      patientName: patient.name,
      age: patient.age ?? undefined,
      sex: capitalizedSex as "Male" | "Female" | "Other" | undefined,
      phone: patient.communicationPhone?.replace('+91', ''),
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
    setHasSelectedOption(true);
    const capitalizedSex = relative.sex ? (relative.sex.charAt(0).toUpperCase() + relative.sex.slice(1).toLowerCase()) : undefined;
    form.reset({
      ...form.getValues(),
      patientId: relative.id,
      patientName: relative.name,
      age: relative.age ?? undefined,
      sex: capitalizedSex as "Male" | "Female" | "Other" | undefined,
      phone: (relative.communicationPhone || primaryPatient?.communicationPhone)?.replace('+91', ''),
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
    return (selectedDoctor.leaveSlots || [])
    .map(leave => {
        if (typeof leave === 'string') {
            try { return parse(leave, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", new Date()); } catch { return null; }
        }
        if (leave && leave.date) {
            try { return parse(leave.date, 'yyyy-MM-dd', new Date()); } catch { return null; }
        }
        return null;
    })
    .filter((date): date is Date => date !== null);
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
    
    // Only consider Pending and Confirmed appointments as "booked"
    // No-show, Skipped, Completed, and Cancelled slots are available for reuse
    const bookedSlotsForDay = otherAppointments
      .filter(apt => 
        apt.doctor === selectedDoctor.name && 
        apt.date === formattedDate && 
        (apt.status === 'Pending' || apt.status === 'Confirmed')
      )
      .reduce((acc, apt) => {
        acc[apt.time] = apt.tokenNumber || apt.time; // Map time to token number
        return acc;
      }, {} as Record<string, string>);
    
    const leaveForDate = selectedDoctor.leaveSlots?.find(ls => typeof ls !== 'string' && ls.date && isSameDay(parse(ls.date, 'yyyy-MM-dd', new Date()), selectedDate));
    const leaveTimeSlots = leaveForDate && typeof leaveForDate !== 'string' ? leaveForDate.slots : [];

    const sessions = availabilityForDay.timeSlots.map((session, sessionIndex) => {
      const slots = [];
      let foundFirstAvailable = false;
      let slotTimeIterator = parseDateFns(session.from, 'hh:mm a', selectedDate);
      const endTime = parseDateFns(session.to, 'hh:mm a', selectedDate);
      // Use currentTime state which updates every minute, not a static new Date()
      const now = currentTime;

      let totalSlotsGenerated = 0;
      let pastSlotsSkipped = 0;
      let oneHourWindowSlotsSkipped = 0;
      let bookedSlotsCount = 0;
      let leaveSlotsCount = 0;
      let availableSlotsCount = 0;
      
      while (slotTimeIterator < endTime) {
        totalSlotsGenerated++;
        const slotTime = format(slotTimeIterator, "hh:mm a");
        let status: 'available' | 'booked' | 'leave' = 'available';

        // Skip past slots - don't show slots that are in the past
        if (isBefore(slotTimeIterator, now)) {
          pastSlotsSkipped++;
          slotTimeIterator = new Date(slotTimeIterator.getTime() + selectedDoctor.averageConsultingTime! * 60000);
          continue;
        }

        // For same-day bookings, skip slots within 1-hour window from current time
        // Slots within 1 hour are reserved for W tokens only - don't show them for A tokens
        if (isToday(selectedDate) && appointmentType === 'Advanced Booking') {
            const slotDateTime = slotTimeIterator; // Current slot time
            const oneHourFromNow = addMinutes(now, 60);
            
            // Skip slot if it's within 1 hour from now (reserved for walk-in tokens)
            // Check: slot time must be AFTER oneHourFromNow (not equal or before)
            if (!isAfter(slotDateTime, oneHourFromNow)) {
                oneHourWindowSlotsSkipped++;
                slotTimeIterator = new Date(slotTimeIterator.getTime() + selectedDoctor.averageConsultingTime! * 60000);
                continue; // Skip this slot entirely
            }
        }

        if (slotTime in bookedSlotsForDay) {
          status = 'booked';
          bookedSlotsCount++;
        } else if (leaveTimeSlots.some((leaveSlot: any) => {
          const leaveStart = parseDateFns(leaveSlot.from, 'hh:mm a', selectedDate);
          const leaveEnd = parseDateFns(leaveSlot.to, 'hh:mm a', selectedDate);
          return slotTimeIterator >= leaveStart && slotTimeIterator < leaveEnd;
        })) {
          status = 'leave';
          leaveSlotsCount++;
        } else {
          availableSlotsCount++;
        }

        // Only show the first available slot, skip booked and leave slots
        if (status === 'available') {
            // Show only the first (earliest) available slot per session for A tokens
            if (!foundFirstAvailable) {
                slots.push({ time: slotTime, status });
                foundFirstAvailable = true;
            }
        }
        // Don't show booked or leave slots - they are filtered out
        
        slotTimeIterator = new Date(slotTimeIterator.getTime() + selectedDoctor.averageConsultingTime! * 60000);
      }
      
      console.log(`🔍 [CLINIC APP] Session ${sessionIndex + 1} slot filtering:`, {
        totalSlotsGenerated,
        pastSlotsSkipped,
        oneHourWindowSlotsSkipped,
        bookedSlotsCount,
        leaveSlotsCount,
        availableSlotsCount,
        visibleSlotsCount: slots.length,
        firstAvailableSlot: foundFirstAvailable ? slots.find(s => s.status === 'available')?.time : 'none',
        currentTime: format(now, 'hh:mm a'),
        oneHourFromNow: isToday(selectedDate) ? format(addMinutes(now, 60), 'hh:mm a') : 'N/A',
        isToday: isToday(selectedDate),
        appointmentType
      });
      
      const sessionTitle = `Session ${sessionIndex + 1} (${session.from} - ${session.to})`;
      return { title: sessionTitle, slots };
    });

    return sessions.filter(s => s.slots.length > 0);
  }, [selectedDate, selectedDoctor, appointments, isEditing, editingAppointment, appointmentType, currentTime]);

  const isAppointmentOnLeave = (appointment: Appointment): boolean => {
      if (!doctors.length || !appointment) return false;
      const doctorForApt = doctors.find(d => d.name === appointment.doctor);
      if (!doctorForApt || !doctorForApt.leaveSlots) return false;
      const aptDate = parse(appointment.date, "d MMMM yyyy", new Date());
      
      return (doctorForApt.leaveSlots || []).some(leave => {
        if (typeof leave === 'string') {
            const leaveDate = parse(leave, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", new Date());
            const aptTime = parse(appointment.time, "hh:mm a", aptDate);
            return leaveDate.getTime() === aptTime.getTime();
        }
        if (leave.date && isSameDay(parse(leave.date, "yyyy-MM-dd", new Date()), aptDate)) {
            const aptTime = parseDateFns(appointment.time, "hh:mm a", new Date(0));
            return leave.slots.some((leaveSlot: any) => {
                const leaveStart = parseDateFns(leaveSlot.from, "hh:mm a", new Date(0));
                const leaveEnd = parseDateFns(leaveSlot.to, "hh:mm a", new Date(0));
                return aptTime >= leaveStart && aptTime < leaveEnd;
            });
        }
        return false;
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
  
  // Compute queues for each doctor/session combination
  const [queuesByDoctor, setQueuesByDoctor] = useState<Record<string, QueueState>>({});
  
  useEffect(() => {
    const computeAllQueues = async () => {
      if (!clinicId || !doctors.length) return;
      
      const filteredForToday = filteredAppointments.filter(apt => apt.date === today);
      const queues: Record<string, QueueState> = {};
      
      // Group appointments by doctor
      const appointmentsByDoctor = filteredForToday.reduce((acc, apt) => {
        if (!acc[apt.doctor]) {
          acc[apt.doctor] = [];
        }
        acc[apt.doctor].push(apt);
        return acc;
      }, {} as Record<string, Appointment[]>);
      
      // Compute queues for each doctor (using first session for now, or we can compute per session)
      for (const [doctorName, doctorAppointments] of Object.entries(appointmentsByDoctor)) {
        const doctor = doctors.find(d => d.name === doctorName);
        if (!doctor) continue;
        
        // For queue computation, we'll use sessionIndex 0 for now (or compute per session)
        // In a real scenario, we'd compute queues per session
        const sessionIndex = 0; // Default to first session
        
        try {
          const queueState = await computeQueues(
            doctorAppointments,
            doctorName,
            doctor.id,
            clinicId,
            today,
            sessionIndex
          );
          
          // Store queue state keyed by doctor name
          queues[doctorName] = queueState;
        } catch (error) {
          console.error(`Error computing queues for ${doctorName}:`, error);
        }
      }
      
      setQueuesByDoctor(queues);
    };
    
    computeAllQueues();
  }, [filteredAppointments, today, clinicId, doctors]);
  
  const todaysAppointments = useMemo(() => {
    const filteredForToday = filteredAppointments.filter(apt => apt.date === today);
    const skipped = filteredForToday.filter(apt => apt.status === 'Skipped');
    const confirmed = filteredForToday.filter(apt => apt.status === 'Confirmed');
    const pending = filteredForToday.filter(apt => apt.status === 'Pending');
  
    const parseTimeForSort = (timeStr: string) => parse(timeStr, "hh:mm a", new Date()).getTime();
  
    // Sort Confirmed by appointment time
    confirmed.sort((a, b) => {
      const timeA = parseTimeForSort(a.time);
      const timeB = parseTimeForSort(b.time);
      return timeA - timeB;
    });
  
    // Sort Pending by appointment time
    pending.sort((a, b) => {
      const timeA = parseTimeForSort(a.time);
      const timeB = parseTimeForSort(b.time);
      return timeA - timeB;
    });
  
    // Return Confirmed at top, then Pending, then Skipped
    return [...confirmed, ...pending, ...skipped];
  }, [filteredAppointments, today]);
  
  // Get buffer queue for a specific doctor (first 2 from arrived queue)
  const getBufferQueue = (doctorName: string): Appointment[] => {
    const queueState = queuesByDoctor[doctorName];
    if (!queueState) return [];
    return queueState.bufferQueue;
  };
  
  // Check if appointment is in buffer queue
  const isInBufferQueue = (appointment: Appointment): boolean => {
    const bufferQueue = getBufferQueue(appointment.doctor);
    return bufferQueue.some(apt => apt.id === appointment.id);
  };

  const isNewPatient = patientSearchTerm.length >= 10 && !selectedPatient;
  const isKloqoMember = primaryPatient && !primaryPatient.clinicIds?.includes(clinicId!);
  
  const isDateDisabled = (date: Date) => {
    if (!selectedDoctor) return true;
  
    // Walk-ins are only available for today (same day)
    if (appointmentType === 'Walk-in') {
      return !isToday(date);
    }
  
    const isPastDate = isBefore(date, startOfDay(new Date()));
    const isNotAvailableDay = !availableDaysOfWeek.includes(getDay(date));
    const isOnLeave = leaveDates.some(leaveDate => isSameDay(date, leaveDate));
  
    if (isPastDate || isNotAvailableDay || isOnLeave) {
      return true;
    }
  
    // Don't disable the date based on 1-hour cutoff - only individual slots within 1 hour will be hidden
    // Booking remains open throughout the day, only slots within 1 hour are hidden
  
    return false;
  };
  
  const firstUpcomingDoctor = useMemo(() => {
    if (todaysAppointments.length === 0) return null;
    const firstUpcomingAppointment = todaysAppointments.find(apt => apt.status !== 'Skipped' && (apt.status === 'Confirmed' || apt.status === 'Pending'));
    if (!firstUpcomingAppointment) return null;
    return doctors.find(d => d.name === firstUpcomingAppointment.doctor) || null;
  }, [todaysAppointments, doctors]);
  
  const isDoctorInConsultation = firstUpcomingDoctor?.consultationStatus === 'In';

  const isBookingButtonDisabled = useMemo(() => {
    if (isPending) return true;
    if (appointmentType === 'Walk-in') {
        return !form.getValues('patientName') || !walkInEstimate || isCalculatingEstimate;
    }
    return !form.formState.isValid;
  }, [isPending, appointmentType, walkInEstimate, isCalculatingEstimate, form.formState.isValid, form.getValues('patientName')]);


  return (
    <>
      <div className="flex-1 overflow-auto">
        <main className="p-6">
          <div className={cn("grid gap-6 transition-all duration-300 ease-in-out", isDrawerExpanded ? "grid-cols-1 md:grid-cols-[2fr_auto_10fr]" : "grid-cols-1 md:grid-cols-[8fr_auto_4fr]")}>
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
                                    onFocus={() => setIsDrawerExpanded(false)}
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
                                {(isPending ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
                                ) : patientSearchTerm.length >= 5 ? (
                                  <CommandGroup>
                                    {/* Show existing patients if found */}
                                    {patientSearchResults.map((patient) => {
                                      const isClinicPatient = patient.clinicIds?.includes(clinicId!);
                                      return (
                                        <CommandItem
                                          key={patient.id}
                                          value={patient.phone}
                                          onSelect={() => {
                                            handlePatientSelect(patient);
                                            setHasSelectedOption(true);
                                            setIsPatientPopoverOpen(false);
                                          }}
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
                                      )
                                    })}
                                    
                                    {/* Always show "Add as new patient" option */}
                                    <CommandItem
                                      value="add-new-patient"
                                      onSelect={() => {
                                        setSelectedPatient(null);
                                        setPrimaryPatient(null);
                                        setHasSelectedOption(true);
                                        setIsPatientPopoverOpen(false);
                                        form.reset({
                                          ...form.getValues(),
                                          patientName: "",
                                          age: undefined,
                                          sex: undefined,
                                          phone: patientSearchTerm,
                                          place: "",
                                          doctor: doctors.length > 0 ? doctors[0].id : "",
                                          department: doctors.length > 0 ? doctors[0].department || "" : "",
                                          date: undefined,
                                          time: undefined,
                                          bookedVia: "Advanced Booking",
                                        });
                                      }}
                                      className="flex items-center space-x-2 py-2 text-blue-600 hover:text-blue-700 border-t"
                                    >
                                      <Plus className="h-4 w-4" />
                                      <span>Add as new patient</span>
                                    </CommandItem>
                                  </CommandGroup>
                                ) : (
                                   patientSearchTerm.length >= 5 && <CommandEmpty>No patient found.</CommandEmpty>
                                ))}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                         {!isDrawerExpanded && (
                           <div className="border p-4 rounded-lg space-y-4">
                            <div className="flex justify-between items-center">
                              <Label>Send Patient Booking Link</Label>
                              <Button type="button" onClick={handleSendLink} disabled={isSendingLink || patientSearchTerm.length < 10}>
                                  {isSendingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <LinkIcon className="mr-2 h-4 w-4" />}
                                  Send Link
                              </Button>
                            </div>
                            
                            {/* Channel Selection Cards */}
                            <div className="grid grid-cols-2 gap-3">
                              <div
                                className={cn(
                                  "p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md",
                                  linkChannel === 'sms' 
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" 
                                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                )}
                                onClick={() => setLinkChannel('sms')}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className={cn(
                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                                    linkChannel === 'sms' 
                                      ? "border-blue-500 bg-blue-500" 
                                      : "border-gray-300 dark:border-gray-600"
                                  )}>
                                    {linkChannel === 'sms' && (
                                      <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                  </div>
                                  <MessageSquare className={cn(
                                    "h-5 w-5",
                                    linkChannel === 'sms' ? "text-blue-600" : "text-gray-500"
                                  )} />
                                  <span className={cn(
                                    "font-medium",
                                    linkChannel === 'sms' ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
                                  )}>
                                    SMS
                                  </span>
                                </div>
                              </div>
                              
                              <div
                                className={cn(
                                  "p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md",
                                  linkChannel === 'whatsapp' 
                                    ? "border-green-500 bg-green-50 dark:bg-green-950/20" 
                                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                )}
                                onClick={() => setLinkChannel('whatsapp')}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className={cn(
                                    "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                                    linkChannel === 'whatsapp' 
                                      ? "border-green-500 bg-green-500" 
                                      : "border-gray-300 dark:border-gray-600"
                                  )}>
                                    {linkChannel === 'whatsapp' && (
                                      <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                  </div>
                                  <Smartphone className={cn(
                                    "h-5 w-5",
                                    linkChannel === 'whatsapp' ? "text-green-600" : "text-gray-500"
                                  )} />
                                  <span className={cn(
                                    "font-medium",
                                    linkChannel === 'whatsapp' ? "text-green-700 dark:text-green-300" : "text-gray-700 dark:text-gray-300"
                                  )}>
                                    WhatsApp
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                         )}
                      </div>
                      
                      {(selectedPatient || hasSelectedOption || isEditing) && (
                        <>
                          <div className="pt-4 border-t">
                            {primaryPatient && !isEditing && (
                              <div className="mb-4">
                                <Tabs value={bookingFor} onValueChange={(value) => {
                                  setBookingFor(value);
                                  if (value === 'member' && primaryPatient) {
                                    setSelectedPatient(primaryPatient);
                                    const capitalizedSex = primaryPatient.sex ? (primaryPatient.sex.charAt(0).toUpperCase() + primaryPatient.sex.slice(1).toLowerCase()) : undefined;
                                    form.reset({
                                      ...form.getValues(),
                                      patientId: primaryPatient.id,
                                      patientName: primaryPatient.name,
                                      age: primaryPatient.age ?? undefined,
                                      sex: capitalizedSex as "Male" | "Female" | "Other" | undefined,
                                      phone: primaryPatient.communicationPhone?.replace('+91', '') || '',
                                      place: primaryPatient.place || "",
                                    });
                                  }
                                }}>
                                  <TabsList className="grid w-full grid-cols-2 bg-muted/30">
                                    <TabsTrigger 
                                      value="member" 
                                      className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-primary/30 data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-primary/10 transition-all duration-200"
                                    >
                                      For Member
                                    </TabsTrigger>
                                    <TabsTrigger 
                                      value="relative"
                                      className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-primary/30 data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-primary/10 transition-all duration-200"
                                    >
                                      For a Relative
                                    </TabsTrigger>
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
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                              {relatives.map((relative) => (
                                                <div
                                                  key={relative.id}
                                                  className="flex flex-col items-center justify-center p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer text-center"
                                                  onClick={() => handleRelativeSelect(relative)}
                                                >
                                                  <Avatar className="h-10 w-10 mb-2">
                                                    <AvatarFallback>{relative.name.charAt(0)}</AvatarFallback>
                                                  </Avatar>
                                                  <div>
                                                    <p className="text-sm font-medium">{relative.name}</p>
                                                    <p className="text-xs text-muted-foreground">{relative.sex}, {relative.age} years</p>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </ScrollArea>
                                        ) : (
                                          <div className="text-center py-4 space-y-2">
                                            <p className="text-xs text-muted-foreground">No relatives found for this patient.</p>
                                            <Button type="button" size="sm" variant="outline" onClick={() => setIsAddRelativeDialogOpen(true)}>
                                                <UserPlus className="mr-2 h-4 w-4" />
                                                Add New Relative
                                            </Button>
                                          </div>
                                        )}
                                        {relatives.length > 0 && (
                                          <Button type="button" className="w-full" variant="outline" onClick={() => setIsAddRelativeDialogOpen(true)}>
                                              <UserPlus className="mr-2 h-4 w-4" />
                                              Add New Relative
                                          </Button>
                                        )}
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
                                    <FormItem>
                                      <FormLabel>Name</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder="Enter patient name"
                                          {...field} 
                                          value={field.value || ''}
                                          onBlur={field.onBlur}
                                          onChange={(e) => {
                                            field.onChange(e);
                                            form.trigger('patientName');
                                          }}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )} />
                                  <FormField control={form.control} name="age" render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Age</FormLabel>
                                      <FormControl>
                                        <Input 
                                          type="number" 
                                          placeholder="Enter the age" 
                                          {...field} 
                                          value={field.value === 0 ? '' : (field.value ?? '')}
                                          onBlur={field.onBlur}
                                          onChange={(e) => {
                                            const value = e.target.value === '' ? undefined : Number(e.target.value);
                                            field.onChange(value);
                                            form.trigger('age');
                                          }}
                                          className="[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )} />
                                  <FormField control={form.control} name="sex" render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Gender</FormLabel>
                                      <Select 
                                        onValueChange={(value) => {
                                          field.onChange(value);
                                          form.trigger('sex');
                                        }} 
                                        value={field.value || ""}
                                      >
                                        <FormControl>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select gender" />
                                          </SelectTrigger>
                                        </FormControl>
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
                                    <FormItem>
                                      <FormLabel>Place</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder="Enter place"
                                          {...field} 
                                          value={field.value || ''}
                                          onBlur={field.onBlur}
                                          onChange={(e) => {
                                            field.onChange(e);
                                            form.trigger('place');
                                          }}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )} />
                                </div>
                                
                                 <FormField
                                    control={form.control}
                                    name="phone"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Communication Phone</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">+91</span>
                                                <Input
                                                    type="tel"
                                                    {...field}
                                                    value={(field.value || '').replace(/^\+91/, '')}
                                                    className="pl-12"
                                                    placeholder="Enter 10-digit number"
                                                    disabled
                                                />
                                            </div>
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
                                        disabled={isDateDisabled}
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
                                                <div className="grid grid-cols-2 gap-2 text-center">
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
                                
                                {/* Appointment Type Selection */}
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Appointment Type</Label>
                                  <RadioGroup onValueChange={(value) => {
                                    form.setValue('bookedVia', value as any);
                                    // When switching to Walk-in, set date to today (walk-ins are same-day only)
                                    if (value === 'Walk-in') {
                                      form.setValue('date', new Date());
                                    }
                                  }} value={form.watch('bookedVia')} className="flex items-center space-x-2">
                                    <Label htmlFor="advanced-booking" className={cn(
                                      "flex-1 px-4 py-3 rounded-md cursor-pointer transition-all duration-200 border-2 text-center font-medium flex items-center justify-center min-h-[4rem]",
                                      form.watch('bookedVia') === 'Advanced Booking' 
                                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300" 
                                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700"
                                    )}>
                                      <RadioGroupItem value="Advanced Booking" id="advanced-booking" className="sr-only" />
                                      Advanced Booking
                                    </Label>
                                    <Label htmlFor="walk-in" className={cn(
                                      "flex-1 px-4 py-3 rounded-md cursor-pointer transition-all duration-200 border-2 text-center font-medium flex items-center justify-center min-h-[4rem]",
                                      form.watch('bookedVia') === 'Walk-in' 
                                        ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300" 
                                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700"
                                    )}>
                                      <RadioGroupItem value="Walk-in" id="walk-in" className="sr-only" />
                                      Walk-in
                                    </Label>
                                  </RadioGroup>
                                </div>
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
                                                        {session.slots.map(slot => {
                                                            const slotMeta = slot as { status?: string; tokenNumber?: string };
                                                            const slotStatus = slotMeta.status ?? 'available';
                                                            return (
                                                                <Button
                                                                    key={slot.time}
                                                                    type="button"
                                                                    variant={form.getValues("time") === format(parseDateFns(slot.time, "hh:mm a", new Date()), 'HH:mm') ? "default" : "outline"}
                                                                    onClick={() => {
                                                                        const val = format(parseDateFns(slot.time, "hh:mm a", new Date()), 'HH:mm');
                                                                        form.setValue("time", val, { shouldValidate: true });
                                                                        if (val) form.clearErrors("time");
                                                                    }}
                                                                    disabled={slotStatus !== 'available'}
                                                                    className={cn("text-xs", {
                                                                        "line-through bg-muted text-muted-foreground": slotStatus === 'booked',
                                                                        "line-through bg-destructive/20 text-destructive-foreground": slotStatus === 'leave',
                                                                    })}
                                                                >
                                                                    {slotStatus === 'booked' && slotMeta.tokenNumber ? slotMeta.tokenNumber : (() => {
                                                                        try {
                                                                            const slotTime = parseDateFns(slot.time, "hh:mm a", selectedDate || new Date());
                                                                            return format(subMinutes(slotTime, 15), 'hh:mm a');
                                                                        } catch {
                                                                            return slot.time;
                                                                        }
                                                                    })()}
                                                                </Button>
                                                            );
                                                        })}
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
                              <Button
                                type="submit"
                                disabled={appointmentType === 'Walk-in' ? isBookingButtonDisabled : (isBookingButtonDisabled || !form.formState.isValid)}
                               >
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
            <div className={cn("h-full", isDrawerExpanded ? "w-full" : "w-auto")}>
              <div className={cn("h-full w-full", isDrawerExpanded ? "p-0" : "")}>
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
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={async () => {
                              console.log('Manual status update triggered');
                              if (clinicId) {
                                try {
                                  await updateAppointmentAndDoctorStatuses(clinicId);
                                  console.log('Manual status update completed');
                                } catch (error) {
                                  console.error('Manual status update failed:', error);
                                }
                              }
                            }}
                            className="ml-2"
                          >
                            Update Status
                          </Button>
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
                            <TabsTrigger value="skipped">Skipped</TabsTrigger>
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
                            {filteredAppointments.map((appointment, index) => (
                              <TableRow key={`${appointment.id}-${index}`} className={cn(
                                isAppointmentOnLeave(appointment) && "bg-red-100 dark:bg-red-900/30",
                                appointment.status === 'Skipped' && "bg-orange-100 dark:bg-orange-900/30"
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
                                        Reschedule
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => setAppointmentToCancel(appointment)} className="text-red-600">
                                        <X className="mr-2 h-4 w-4" />
                                        Cancel
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
                          {activeTab === 'skipped' ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Patient</TableHead>
                                  <TableHead>Token</TableHead>
                                  <TableHead>Time</TableHead>
                                  <TableHead className="text-right">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {todaysAppointments
                                  .filter(apt => apt.status === 'Skipped')
                                  .map((appointment, index) => (
                                    <TableRow
                                      key={`${appointment.id}-${index}`}
                                      className={cn(
                                        appointment.status === 'Skipped' && "bg-red-200/50 dark:bg-red-900/60"
                                      )}
                                    >
                                      <TableCell className="font-medium">{appointment.patientName}</TableCell>
                                      <TableCell>{appointment.tokenNumber}</TableCell>
                                      <TableCell>{appointment.time}</TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          <Badge variant="destructive">Skipped</Badge>
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="p-0 h-auto text-blue-600 hover:text-blue-700"
                                                  onClick={() => handleRejoinQueue(appointment)}
                                                >
                                                  <Repeat className="h-5 w-5" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Re-Join Queue</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <div className="space-y-6 p-4">
                              {/* Arrived Section (Confirmed) */}
                              <div>
                                <div className="mb-3 flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  <h3 className="font-semibold text-sm">Arrived ({todaysAppointments.filter(apt => apt.status === 'Confirmed').length})</h3>
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Patient</TableHead>
                                      <TableHead>Token</TableHead>
                                      <TableHead>Time</TableHead>
                                      <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {todaysAppointments
                                      .filter(apt => apt.status === 'Confirmed')
                                      .map((appointment, index) => {
                                        const isBuffer = isInBufferQueue(appointment);
                                        return (
                                          <TableRow
                                            key={`${appointment.id}-${index}`}
                                            className={cn(
                                              isBuffer && "bg-yellow-100 dark:bg-yellow-900/30"
                                            )}
                                          >
                                            <TableCell className="font-medium">
                                              <div className="flex items-center gap-2">
                                                {appointment.patientName}
                                                {isBuffer && (
                                                  <Badge variant="outline" className="text-xs bg-yellow-200 border-yellow-400">
                                                    Buffer
                                                  </Badge>
                                                )}
                                              </div>
                                            </TableCell>
                                            <TableCell>{appointment.tokenNumber}</TableCell>
                                            <TableCell>{appointment.time}</TableCell>
                                            <TableCell className="text-right">
                                              <div className="flex justify-end gap-2">
                                                {index === 0 && (
                                                  <TooltipProvider>
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <div>
                                                          <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="p-0 h-auto text-green-600 hover:text-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            onClick={() => setAppointmentToComplete(appointment)}
                                                            disabled={!isDoctorInConsultation}
                                                          >
                                                            <CheckCircle2 className="h-5 w-5" />
                                                          </Button>
                                                        </div>
                                                      </TooltipTrigger>
                                                      {!isDoctorInConsultation && (
                                                        <TooltipContent>
                                                          <p>Doctor is not in consultation.</p>
                                                        </TooltipContent>
                                                      )}
                                                    </Tooltip>
                                                  </TooltipProvider>
                                                )}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                  </TableBody>
                                </Table>
                              </div>
                              
                              {/* Pending Section */}
                              <div>
                                <div className="mb-3 flex items-center gap-2">
                                  <Clock className="h-4 w-4 text-orange-600" />
                                  <h3 className="font-semibold text-sm">Pending ({todaysAppointments.filter(apt => apt.status === 'Pending').length})</h3>
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Patient</TableHead>
                                      <TableHead>Token</TableHead>
                                      <TableHead>Time</TableHead>
                                      <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {todaysAppointments
                                      .filter(apt => apt.status === 'Pending')
                                      .map((appointment, index) => (
                                        <TableRow
                                          key={`${appointment.id}-${index}`}
                                        >
                                          <TableCell className="font-medium">{appointment.patientName}</TableCell>
                                          <TableCell>{appointment.tokenNumber}</TableCell>
                                          <TableCell>{appointment.time}</TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                              {shouldShowConfirmArrival(appointment) && (
                                                <TooltipProvider>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="p-0 h-auto text-blue-600 hover:text-blue-700"
                                                        onClick={() => setAppointmentToAddToQueue(appointment)}
                                                      >
                                                        <CheckCircle2 className="h-5 w-5" />
                                                      </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      <p>Confirm Arrival</p>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </TooltipProvider>
                                              )}
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}
                        </>
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
        <DialogContent className="sm:max-w-xs w-[90%]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">Walk-in Token Generated!</DialogTitle>
            <DialogDescription className="text-center">
              Please wait for your turn. You can monitor the live queue.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">Your Token Number</p>
              <p className="text-5xl font-bold text-primary">{generatedToken}</p>
          </div>
          <DialogClose asChild>
              <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-6 w-6 text-muted-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
              </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!appointmentToCancel} onOpenChange={(open) => !open && setAppointmentToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the appointment for "{appointmentToCancel?.patientName}" on {appointmentToCancel?.date} at {appointmentToCancel?.time}. The patient will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToCancel(null)}>No, Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => {
                if (appointmentToCancel) {
                  handleCancel(appointmentToCancel);
                }
                setAppointmentToCancel(null);
              }}
            >
              Yes, Cancel Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!appointmentToAddToQueue && appointmentToAddToQueue.status === 'Pending'} onOpenChange={(open) => !open && setAppointmentToAddToQueue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Patient Arrived at Clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm that "{appointmentToAddToQueue?.patientName}" has arrived at the clinic. This will change their status to "Confirmed" and add them to the queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToAddToQueue(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-500 hover:bg-blue-600"
              onClick={() => {
                if (appointmentToAddToQueue && appointmentToAddToQueue.status === 'Pending') {
                  handleAddToQueue(appointmentToAddToQueue);
                }
                setAppointmentToAddToQueue(null);
              }}
            >
              Yes, Confirm Arrival
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!appointmentToComplete} onOpenChange={(open) => !open && setAppointmentToComplete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Appointment as Completed?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark the appointment for "{appointmentToComplete?.patientName}" as completed? This will update the appointment status and notify the patient.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAppointmentToComplete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-500 hover:bg-green-600"
              onClick={() => {
                if (appointmentToComplete) {
                  handleComplete(appointmentToComplete);
                }
                setAppointmentToComplete(null);
              }}
            >
              Yes, Mark as Completed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <WeeklyDoctorAvailability />
    </>
  );
}