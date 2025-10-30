"use client";

import { useEffect, useState, useMemo, useRef, useCallback, useTransition } from "react";
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
import type { Appointment, Doctor, Patient, User } from "@/lib/types";
import { collection, getDocs, setDoc, doc, query, where, getDoc as getFirestoreDoc, updateDoc, increment, arrayUnion, deleteDoc, writeBatch, serverTimestamp, addDoc, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { parse, isSameDay, parse as parseDateFns, format, getDay, isPast, isFuture, isToday, startOfYear, endOfYear, addMinutes, isBefore, subMinutes, isAfter, startOfDay, addHours, subDays } from "date-fns";
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
import { ChevronLeft, FileDown, Printer, Search, MoreHorizontal, Eye, Edit, Trash2, ChevronRight, Stethoscope, Phone, Footprints, Loader2, Link as LinkIcon, Crown, UserCheck, UserPlus, Users, Plus, X, Clock, Calendar as CalendarLucide, CheckCircle2, Info, Send, MessageSquare, Smartphone, SkipForward, Hourglass, Repeat } from "lucide-react";
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
import { calculateWalkInDetails, generateNextToken, generateNextTokenAndReserveSlot } from '@/lib/appointment-service';
import { sendAppointmentCancelledNotification, sendTokenCalledNotification, sendAppointmentBookedByStaffNotification } from '@/lib/notification-service';

const formSchema = z.object({
  id: z.string().optional(),
  patientName: z.string().min(2, { message: "Name must be at least 2 characters." }),
  sex: z.enum(["Male", "Female", "Other"]),
  phone: z.string(),
  age: z.coerce.number({
    invalid_type_error: "Age must be a number."
  }).min(0, "Age cannot be negative.").optional(),
  doctor: z.string().min(1, { message: "Please select a doctor." }),
  department: z.string().min(1, { message: "Department is required." }),
  date: z.date().optional(),
  time: z.string().optional(),
  place: z.string().min(2, { message: "Place must be at least 2 characters." }),
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
  const [appointmentToSkip, setAppointmentToSkip] = useState<Appointment | null>(null);
  
  const [linkChannel, setLinkChannel] = useState<'sms' | 'whatsapp'>('sms');

  const { toast } = useToast();
  const isEditing = !!editingAppointment;

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patientName: "",
      phone: "",
      age: undefined,
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

        // Optimize: Limit to last 2000 appointments to prevent excessive data load
        // Client-side filtering will further refine by date range
        const minDate = subDays(new Date(), 90);
        const currentYear = new Date().getFullYear();
        
        // Query with limit to prevent fetching too many documents
        // We fetch 2000 most recent appointments as a reasonable limit
        // Note: If you need more, consider pagination or date-based queries
        const appointmentsQuery = query(
            collection(db, "appointments"), 
            where("clinicId", "==", fetchedClinicId),
            limit(2000) // Safety limit: fetch max 2000 appointments
        );
        
        const appointmentsUnsubscribe = onSnapshot(appointmentsQuery, (snapshot) => {
            let appointmentsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
            
            // Client-side filter: Prioritize appointments from last 90 days or current year
            // This ensures we show recent and upcoming appointments while limiting data
            const filteredAppointments = appointmentsList.filter(apt => {
                try {
                    const aptDate = parse(apt.date, "d MMMM yyyy", new Date());
                    // Keep if within last 90 days OR from current/future year (for upcoming appointments)
                    const isRecent = aptDate >= minDate;
                    const isCurrentOrFutureYear = aptDate.getFullYear() >= currentYear;
                    return isRecent || isCurrentOrFutureYear;
                } catch {
                    // If date parsing fails, include it (safer than excluding valid data)
                    return true;
                }
            });
            
            // If after filtering we still have too many, limit to 2000
            appointmentsList = filteredAppointments.slice(0, 2000);
            
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

  const selectedDoctor = useMemo(() => {
    const doctorId = form.watch("doctor");
    if (!doctorId) return doctors.length > 0 ? doctors[0] : null;
    return doctors.find(d => d.id === doctorId) || null;
  }, [doctors, form.watch("doctor")]);

  const selectedDate = form.watch("date");
  const appointmentType = form.watch("bookedVia");


  const isWithinBookingWindow = (doctor: Doctor | null): boolean => {
    if (!doctor || !doctor.availabilitySlots) return false;
    const now = new Date();
    const todayStr = format(now, 'EEEE');
    const todaySlots = doctor.availabilitySlots.find(s => s.day === todayStr);
    if (!todaySlots) return false;
    for (const session of todaySlots.timeSlots) {
      const sessionStart = parseTime(session.from, now);
      const sessionEnd = parseTime(session.to, now);
      const walkInWindowStart = subMinutes(sessionStart, 30);
      const walkInWindowEnd = subMinutes(sessionEnd, 30);
      if (now >= walkInWindowStart && now <= walkInWindowEnd) return true;
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
        
        const patientDataToUpdate = {
          name: values.patientName,
            age: values.age || 0,
          sex: values.sex,
          place: values.place,
          phone: values.phone ? `+91${values.phone}` : "",
          communicationPhone: communicationPhone,
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
          // Creating a new user and patient
          const usersRef = collection(db, 'users');
          const patientPhoneNumber = `+91${values.phone}`;
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

            const newPatientData: Patient = {
              id: patientId,
              primaryUserId: userId,
              ...patientDataToUpdate,
              clinicIds: [clinicId],
              visitHistory: [],
              totalAppointments: 0,
              relatedPatientIds: [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            batch.set(patientRef, newPatientData);

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
                    ...patientDataToUpdate,
                    updatedAt: serverTimestamp()
                };
                if (!existingPatientSnap.data().clinicIds?.includes(clinicId)) {
                    updateData.clinicIds = arrayUnion(clinicId);
                }
                batch.update(existingPatientRef, updateData);
            } else {
                // This case is unlikely if DB is consistent, but handles it.
                // User exists but patient record is missing. Create it.
                const newPatientData: Patient = {
                  id: patientId,
                  primaryUserId: userId,
                  ...patientDataToUpdate,
                  clinicIds: [clinicId],
                  visitHistory: [],
                  totalAppointments: 0,
                  relatedPatientIds: [],
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                };
                batch.set(patientRef, newPatientData);
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
          
          // Use generateNextToken service for walk-ins to ensure sequential numbering
          const walkInTokenNumber = await generateNextToken(clinicId, selectedDoctor.name, date, 'W');
          const walkInNumericToken = parseInt(walkInTokenNumber.substring(1), 10);
          
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
            age: values.age || 0,
            communicationPhone: communicationPhone,
            place: values.place,
            status: 'Pending',
            time: format(walkInEstimate.estimatedTime, "hh:mm a"),
            tokenNumber: walkInTokenNumber,
            numericToken: walkInNumericToken,
            slotIndex: walkInEstimate.slotIndex,
            sessionIndex: walkInEstimate.sessionIndex,
            treatment: "General Consultation",
            createdAt: serverTimestamp(),
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
          const appointmentDateStr = format(values.date, "d MMMM yyyy");
          const appointmentTimeStr = format(parseDateFns(values.time, "HH:mm", new Date()), "hh:mm a");

          let slotIndex = -1;
          let sessionIndex = -1;
          const dayOfWeek = daysOfWeek[getDay(values.date)];
          const availabilityForDay = selectedDoctor.availabilitySlots?.find(s => s.day === dayOfWeek);

          if (availabilityForDay) {
            for (let i = 0; i < availabilityForDay.timeSlots.length; i++) {
              const session = availabilityForDay.timeSlots[i];
              let currentTime = parseDateFns(session.from, 'hh:mm a', values.date);
              const endTime = parseDateFns(session.to, 'hh:mm a', values.date);
              let currentSlotInSession = 0;

              while (isBefore(currentTime, endTime)) {
                if (format(currentTime, "hh:mm a") === appointmentTimeStr) {
                  slotIndex = currentSlotInSession;
                  sessionIndex = i;
                  break;
                }
                currentTime = addMinutes(currentTime, selectedDoctor.averageConsultingTime || 15);
                currentSlotInSession++;
              }
              if (slotIndex !== -1) break;
            }
          }

          // For editing, use existing token; for new appointments, use transaction-based slot reservation
          let tokenData: { tokenNumber: string; numericToken: number };
          if (isEditing && editingAppointment) {
            tokenData = { tokenNumber: editingAppointment.tokenNumber, numericToken: editingAppointment.numericToken };
          } else {
            try {
              // Use transaction-based slot reservation to prevent A token collisions
              tokenData = await generateNextTokenAndReserveSlot(
                clinicId,
                selectedDoctor.name,
                values.date,
                'A',
                {
                  time: appointmentTimeStr,
                  slotIndex: slotIndex
                }
              );
            } catch (error: any) {
              if (error.code === 'SLOT_OCCUPIED' || error.message === 'SLOT_ALREADY_BOOKED') {
                toast({ 
                  variant: "destructive", 
                  title: "Slot Already Booked", 
                  description: "This time slot is already booked. Please select another time." 
                });
                return;
              }
              throw error;
            }
          }

          const appointmentData: Appointment = {
            id: appointmentId,
            clinicId: clinicId,
            patientId: patientForAppointmentId,
            patientName: patientForAppointmentName,
            sex: values.sex,
            communicationPhone: communicationPhone,
            age: values.age || 0,
            doctorId: selectedDoctor.id, // Add doctorId
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
            slotIndex: slotIndex,
            sessionIndex: sessionIndex,
            createdAt: isEditing ? editingAppointment.createdAt : serverTimestamp(),
          };

          const appointmentRef = doc(db, 'appointments', appointmentId);
          await setDoc(appointmentRef, appointmentData, { merge: true });

          if (!isEditing) {
            const patientRef = doc(db, 'patients', patientForAppointmentId);
            await updateDoc(patientRef, {
              visitHistory: arrayUnion(appointmentId),
              totalAppointments: increment(1),
              updatedAt: serverTimestamp(),
            });
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
            // User exists, just send the link
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
                age: 0,
                sex: "",
                place: "",
                email: "",
                clinicIds: [clinicId],
                totalAppointments: 0,
                visitHistory: [],
                relatedPatientIds: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            batch.set(newPatientRef, newPatientData as Patient);

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
        await updateDoc(appointmentRef, { status: 'Completed', completedAt: serverTimestamp() });
        setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'Completed' as const } : a));
        
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
        await updateDoc(appointmentRef, { status: 'Skipped' });
        setAppointments(prev => {
          const updated = prev.map(a => a.id === appointment.id ? { ...a, status: 'Skipped' as const } : a);
          return [
            ...updated.filter(a => a.status !== 'Skipped'),
            ...updated.filter(a => a.status === 'Skipped'),
          ] as Appointment[];
        });
        toast({ title: "Appointment Skipped" });
      } catch (error) {
        console.error("Error skipping appointment:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to skip appointment." });
      }
    });
  };

  const handleRejoinQueue = (appointment: Appointment) => {
    startTransition(async () => {
      if (!clinicId || !selectedDoctor) return;
  
      const recurrence = clinicDetails?.skippedTokenRecurrence || 3;
      const avgConsultingTime = selectedDoctor.averageConsultingTime || 15;
  
      // Get today's active appointments for the same doctor, sorted by time
      const today = new Date();
      const todayStr = format(today, 'd MMMM yyyy');
      const activeAppointments = appointments
        .filter(a =>
          a.doctor === appointment.doctor &&
          a.date === todayStr &&
          (a.status === 'Pending' || a.status === 'Confirmed')
        )
        .sort((a, b) => parseTime(a.time, today).getTime() - parseTime(b.time, today).getTime());
  
      if (activeAppointments.length === 0) {
        // No active queue, just set their time to now + a small delay
        const newTime = format(addMinutes(new Date(), 5), 'hh:mm a');
        await updateDoc(doc(db, 'appointments', appointment.id), { time: newTime, status: 'Confirmed' });
        toast({ title: 'Re-joined Queue', description: `${appointment.patientName} is now next.` });
        return;
      }
  
      const insertionIndex = Math.min(recurrence, activeAppointments.length);
      const lastPatientBeforeInsertion = activeAppointments[insertionIndex - 1];
      const newTimeForSkipped = addMinutes(parseTime(lastPatientBeforeInsertion.time, today), avgConsultingTime);
      
      const batch = writeBatch(db);
  
      // Update the skipped appointment
      const skippedRef = doc(db, 'appointments', appointment.id);
      batch.update(skippedRef, {
        status: 'Confirmed',
        time: format(newTimeForSkipped, 'hh:mm a'),
      });
  
      // Ripple update for subsequent appointments
      for (let i = insertionIndex; i < activeAppointments.length; i++) {
        const aptToShift = activeAppointments[i];
        const newTime = addMinutes(parseTime(aptToShift.time, today), avgConsultingTime);
        const aptRef = doc(db, 'appointments', aptToShift.id);
        batch.update(aptRef, { time: format(newTime, 'hh:mm a') });
      }
  
      try {
        await batch.commit();
        toast({
          title: "Patient Re-joined Queue",
          description: `${appointment.patientName} has been added back to the queue. Subsequent appointments have been rescheduled.`
        });
      } catch (error) {
        console.error("Error re-joining queue:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not re-join the patient to the queue." });
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

    const capitalizedSex = patient.sex ? (patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1).toLowerCase()) : "Male";

    form.reset({
      ...form.getValues(),
      patientId: patient.id,
      patientName: patient.name,
      age: patient.age,
      sex: capitalizedSex as "Male" | "Female" | "Other",
      phone: patient.communicationPhone?.replace('+91', ''),
      place: patient.place || "",
    });
  };
}
