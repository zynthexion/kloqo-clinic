

"use client";

import React, { useState, useEffect, useMemo, useTransition, useCallback } from "react";
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
import { doc, updateDoc, collection, getDocs, setDoc, getDoc, query, where, writeBatch, arrayRemove, Timestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Doctor, Appointment, LeaveSlot, Department, TimeSlot } from "@/lib/types";
import { format, parse, isSameDay, getDay, addMinutes, subMinutes, isWithinInterval, differenceInMinutes, isPast, parseISO, startOfDay, isToday, isBefore } from "date-fns";
import { Clock, User, BriefcaseMedical, Calendar as CalendarIcon, Info, Edit, Save, X, Trash, Copy, Loader2, ChevronLeft, ChevronRight, Search, Star, Users, CalendarDays, Link as LinkIcon, PlusCircle, DollarSign, Printer, FileDown, ChevronUp, ChevronDown, Minus, Trophy, Repeat, CalendarCheck, Upload, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
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
import { cn, parseTime as parseTimeUtil } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
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
import { useAuth } from "@/firebase";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import imageCompression from 'browser-image-compression';
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { ReviewsSection } from "@/components/reviews-section";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";


const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayAbbreviations = ["S", "M", "T", "W", "T", "F", "S"];

const timeSlotSchema = z.object({
  from: z.string().min(1, "Required"),
  to: z.string().min(1, "Required"),
}).refine(data => {
    if (!data.from || !data.to) return true; // Let the min(1) handle empty fields
    return data.from < data.to;
}, {
    message: "End time must be after start time.",
    path: ["to"],
});

const availabilitySlotSchema = z.object({
  day: z.string(),
  timeSlots: z.array(timeSlotSchema).min(1, "At least one time slot is required."),
}).refine(data => {
    const sortedSlots = [...data.timeSlots].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 0; i < sortedSlots.length - 1; i++) {
        if (sortedSlots[i].to > sortedSlots[i+1].from) {
            return false; // Overlap detected
        }
    }
    return true;
}, {
    message: "Time slots cannot overlap.",
    path: ["timeSlots"],
});


const weeklyAvailabilityFormSchema = z.object({
  availableDays: z.array(z.string()).default([]),
  availabilitySlots: z.array(availabilitySlotSchema).min(1, "At least one availability slot is required."),
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
                doctor.consultationStatus === "In" ? "bg-green-500" : "bg-red-500"
            )} />
        </div>
        <div>
            <p className="font-semibold text-sm">{doctor.name}</p>
            <p className="text-xs text-muted-foreground">{doctor.department}</p>
        </div>
    </Card>
);

const generateTimeOptions = (startTime: string, endTime: string, interval: number): string[] => {
    const options = [];
    let currentTime = parse(startTime, "HH:mm", new Date());
    const end = parse(endTime, "HH:mm", new Date());

    while (isBefore(currentTime, end)) {
        options.push(format(currentTime, "HH:mm"));
        currentTime = addMinutes(currentTime, interval);
    }
    options.push(format(end, "HH:mm")); // Include the end time
    return options;
};

export default function DoctorsPage() {
  const auth = useAuth();
  const [isPending, startTransition] = useTransition();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState("details");

  const searchParams = useSearchParams();
  const doctorIdFromUrl = searchParams.get('doctorId');

  const form = useForm<WeeklyAvailabilityFormValues>({
    resolver: zodResolver(weeklyAvailabilityFormSchema),
    defaultValues: {
      availableDays: [],
      availabilitySlots: [],
    },
    mode: "onBlur",
  });
  
  const { toast } = useToast();

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [clinicDepartments, setClinicDepartments] = useState<Department[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [leaveCalDate, setLeaveCalDate] = useState<Date>(new Date());
  const [clinicDetails, setClinicDetails] = useState<any | null>(null);
  
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
  const [newExperience, setNewExperience] = useState<number | string>("");
  const [newRegistrationNumber, setNewRegistrationNumber] = useState("");
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);


  const [isEditingAvailability, setIsEditingAvailability] = useState(false);
  
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [sharedTimeSlots, setSharedTimeSlots] = useState<Array<{ from: string; to: string }>>([{ from: "09:00", to: "17:00" }]);

  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [doctorsPerPage, setDoctorsPerPage] = useState(10);
  const [isAddDoctorOpen, setIsAddDoctorOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);

  const [isEditingFollowUp, setIsEditingFollowUp] = useState(false);
  const [newFollowUp, setNewFollowUp] = useState<number | string>(0);
  const [isEditingBooking, setIsEditingBooking] = useState(false);
  const [newBooking, setNewBooking] = useState<number | string>(0);
  const [isUpdatingConsultationStatus, setIsUpdatingConsultationStatus] = useState(false);

  // State for break scheduling
  const [startSlot, setStartSlot] = useState<Date | null>(null);
  const [endSlot, setEndSlot] = useState<Date | null>(null);
  const [showExtensionDialog, setShowExtensionDialog] = useState(false);
  const [pendingBreakData, setPendingBreakData] = useState<{ startSlot: Date; endSlot: Date } | null>(null);
  const [extensionOptions, setExtensionOptions] = useState<{ hasOverrun: boolean; minimalExtension: number; fullExtension: number; lastTokenBefore: string; lastTokenAfter: string; originalEnd: string; breakDuration: number } | null>(null);
  const [allBookedSlots, setAllBookedSlots] = useState<number[]>([]);
  const [isSubmittingBreak, setIsSubmittingBreak] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchAllData = async () => {
      try {
        const userDocRef = doc(db, "users", auth.currentUser!.uid);
        const userDocSnap = await getDoc(userDocRef);
        const clinicId = userDocSnap.data()?.clinicId;

        if (!clinicId) {
          toast({ variant: "destructive", title: "Error", description: "Clinic not found for this user."});
          return;
        }

        const doctorsQuery = query(collection(db, "doctors"), where("clinicId", "==", clinicId));
        const appointmentsQuery = query(collection(db, "appointments"), where("clinicId", "==", clinicId));
        
        const [doctorsSnapshot, appointmentsSnapshot, masterDepartmentsSnapshot, clinicDocSnap] = await Promise.all([
          getDocs(doctorsQuery),
          getDocs(appointmentsQuery),
          getDocs(collection(db, "master-departments")),
          getDoc(doc(db, "clinics", clinicId))
        ]);

        if (clinicDocSnap.exists()) {
          setClinicDetails(clinicDocSnap.data());
        }
        
        const masterDepartmentsList = masterDepartmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));

        if (clinicDocSnap.exists()) {
            const clinicData = clinicDocSnap.data();
            const departmentIds: string[] = clinicData.departments || [];
            const deptsForClinic = masterDepartmentsList.filter(masterDept => departmentIds.includes(masterDept.id));
            setClinicDepartments(deptsForClinic);
        }

        const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), clinicId } as Doctor));
        setDoctors(doctorsList);
        if (doctorsList.length > 0 && !selectedDoctor) {
          setSelectedDoctor(doctorsList[0]);
        }

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
  }, [auth.currentUser, toast, selectedDoctor]);

  // Auto-select doctor from URL parameter
  useEffect(() => {
    if (doctorIdFromUrl && doctors.length > 0) {
      const doctorFromUrl = doctors.find(doctor => doctor.id === doctorIdFromUrl);
      if (doctorFromUrl && (!selectedDoctor || selectedDoctor.id !== doctorIdFromUrl)) {
        setSelectedDoctor(doctorFromUrl);
      }
    }
  }, [doctorIdFromUrl, doctors, selectedDoctor]);
  

  useEffect(() => {
    if (selectedDoctor) {
      setNewAvgTime(selectedDoctor.averageConsultingTime || "");
      setNewFee(selectedDoctor.consultationFee || "");
      setNewFollowUp(selectedDoctor.freeFollowUpDays || 0);
      setNewBooking(selectedDoctor.advanceBookingDays || 0);
      setNewName(selectedDoctor.name);
      setNewBio(selectedDoctor.bio || "");
      setNewSpecialty(selectedDoctor.specialty);
      setNewDepartment(selectedDoctor.department || "");
      setNewExperience(selectedDoctor.experience || 0);
      setNewRegistrationNumber(selectedDoctor.registrationNumber || "");
      setPhotoPreview(selectedDoctor.avatar);
      setNewPhoto(null);
      form.reset({
        availabilitySlots: selectedDoctor.availabilitySlots || [],
      });
      setIsEditingDetails(false);
      setIsEditingBio(false);
      setIsEditingAvailability(false);
      setIsEditingTime(false);
      setIsEditingFee(false);
      setIsEditingFollowUp(false);
      setIsEditingBooking(false);
    }
  }, [selectedDoctor, appointments, form]);

  useEffect(() => {
    if (selectedDoctor && leaveCalDate) {
        const dateStr = format(leaveCalDate, "d MMMM yyyy");
        const appointmentsOnDate = appointments.filter(apt => apt.doctor === selectedDoctor.name && apt.date === dateStr);
        const fetchedBookedSlots = appointmentsOnDate.map(d => parseTimeUtil(d.time, leaveCalDate).getTime());
        setAllBookedSlots(fetchedBookedSlots);
    }
  }, [selectedDoctor, leaveCalDate, appointments]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };


  const handleEditAvailability = () => {
    if (!selectedDoctor) return;

    const availabilitySlotsForForm = selectedDoctor.availabilitySlots?.map(s => {
      return {
        ...s,
        timeSlots: s.timeSlots.map(ts => {
          try {
            // If already in HH:mm, this will work. If in hh:mm a, it will convert.
            const parsedFrom = parse(ts.from, 'hh:mm a', new Date());
            const parsedTo = parse(ts.to, 'hh:mm a', new Date());
            
            return {
              from: !isNaN(parsedFrom.valueOf()) ? format(parsedFrom, 'HH:mm') : ts.from,
              to: !isNaN(parsedTo.valueOf()) ? format(parsedTo, 'HH:mm') : ts.to
            }
          } catch {
            return { from: ts.from, to: ts.to };
          }
        })
      };
    }) || [];

    form.reset({
        availabilitySlots: availabilitySlotsForForm,
    });
  
    setIsEditingAvailability(true);
  };

  const handleDoctorSaved = (savedDoctor: Doctor) => {
    setDoctors(prev => {
        const index = prev.findIndex(d => d.id === savedDoctor.id);
        if (index > -1) {
            // Update existing doctor
            const newDoctors = [...prev];
            newDoctors[index] = savedDoctor;
            return newDoctors;
        } else {
            // Add new doctor
            return [...prev, savedDoctor];
        }
    });
    setSelectedDoctor(savedDoctor);
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
                    description: `Consultation fee set to ₹${feeValue}.`,
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

    const handleFollowUpSave = async () => {
        if (!selectedDoctor || newFollowUp === "") return;
        const value = Number(newFollowUp);
        if (isNaN(value) || value < 0) {
            toast({ variant: "destructive", title: "Invalid Value", description: "Please enter a valid non-negative number of days." });
            return;
        }
        startTransition(async () => {
            try {
                const doctorRef = doc(db, "doctors", selectedDoctor.id);
                await updateDoc(doctorRef, { freeFollowUpDays: value });
                const updatedDoctor = { ...selectedDoctor, freeFollowUpDays: value };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === updatedDoctor.id ? updatedDoctor : d));
                setIsEditingFollowUp(false);
                toast({ title: "Success", description: "Free follow-up period updated." });
            } catch (error) {
                console.error("Error updating follow-up days:", error);
                toast({ variant: "destructive", title: "Error", description: "Failed to update follow-up period." });
            }
        });
    };

    const handleBookingSave = async () => {
        if (!selectedDoctor || newBooking === "") return;
        const value = Number(newBooking);
        if (isNaN(value) || value < 0) {
            toast({ variant: "destructive", title: "Invalid Value", description: "Please enter a valid non-negative number of days." });
            return;
        }
        startTransition(async () => {
            try {
                const doctorRef = doc(db, "doctors", selectedDoctor.id);
                await updateDoc(doctorRef, { advanceBookingDays: value });
                const updatedDoctor = { ...selectedDoctor, advanceBookingDays: value };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === updatedDoctor.id ? updatedDoctor : d));
                setIsEditingBooking(false);
                toast({ title: "Success", description: "Advance booking period updated." });
            } catch (error) {
                console.error("Error updating booking days:", error);
                toast({ variant: "destructive", title: "Error", description: "Failed to update booking period." });
            }
        });
    };

    const handleDetailsSave = async () => {
        if (!selectedDoctor || !auth.currentUser) return;
        if (newName.trim() === "" || newSpecialty.trim() === "" || newDepartment.trim() === "") {
            toast({ variant: "destructive", title: "Invalid Details", description: "Name, specialty, and department cannot be empty." });
            return;
        }

        startTransition(async () => {
            try {
                let photoUrl = selectedDoctor.avatar;
                if (newPhoto) {
                    const options = { maxSizeMB: 0.5, maxWidthOrHeight: 800, useWebWorker: true };
                    const compressedFile = await imageCompression(newPhoto, options);
                    const formData = new FormData();
                    formData.append('file', compressedFile);
                    formData.append('clinicId', selectedDoctor.clinicId);
                    formData.append('userId', auth.currentUser!.uid);

                    const response = await fetch('/api/upload-avatar', {
                        method: 'POST',
                        body: formData,
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Upload failed');
                    }
                    const data = await response.json();
                    photoUrl = data.url;
                }

                const updatedData = {
                    name: newName,
                    specialty: newSpecialty,
                    department: newDepartment,
                    experience: Number(newExperience),
                    registrationNumber: newRegistrationNumber,
                    avatar: photoUrl,
                };
                
                const doctorRef = doc(db, "doctors", selectedDoctor.id);
                await updateDoc(doctorRef, updatedData);
                const updatedDoctor = { ...selectedDoctor, ...updatedData };
                
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));
                setNewPhoto(null);
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
          .map(slot => {
              const filteredTimeSlots = slot.timeSlots.filter(ts => ts.from && ts.to);
              return { ...slot, timeSlots: filteredTimeSlots };
          })
          .filter(slot => slot.timeSlots.length > 0);
    
        const newAvailabilitySlots = validSlots.map(s => ({
          ...s,
          timeSlots: s.timeSlots.map(ts => ({
            from: format(parse(ts.from, "HH:mm", new Date()), "hh:mm a"),
            to: format(parse(ts.to, "HH:mm", new Date()), "hh:mm a")
          }))
        }));

        const scheduleString = newAvailabilitySlots
          ?.sort((a, b) => daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day))
          .map(slot => `${slot.day}: ${slot.timeSlots.map(ts => `${ts.from}-${ts.to}`).join(', ')}`)
          .join('; ');
    
        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                const existingLeaveSlots: (LeaveSlot | string)[] = selectedDoctor.leaveSlots || [];
                const cleanedLeaveSlots: (LeaveSlot | string)[] = [];

                for (const leave of existingLeaveSlots) {
                    let leaveDate: Date;
                    let isStringFormat = false;

                    if (typeof leave === 'string') {
                        leaveDate = parseISO(leave);
                        isStringFormat = true;
                    } else if (leave && leave.date && Array.isArray(leave.slots)) {
                        leaveDate = parse(leave.date, 'yyyy-MM-dd', new Date());
                    } else {
                        continue;
                    }

                    if (isNaN(leaveDate.getTime())) continue;

                    const dayName = format(leaveDate, 'EEEE');
                    const availabilityForDay = newAvailabilitySlots.find(s => s.day === dayName);

                    if (!availabilityForDay) {
                        continue; 
                    }

                    if (isStringFormat) {
                        const leaveTime = leaveDate;
                         const isContained = availabilityForDay.timeSlots.some(availableSlot => {
                            const availableStart = parse(availableSlot.from, "hh:mm a", new Date());
                            const availableEnd = parse(availableSlot.to, "hh:mm a", new Date());
                            return isWithinInterval({ start: leaveTime, end: leaveTime }, { start: availableStart, end: availableEnd });
                        });
                         if (isContained) {
                            cleanedLeaveSlots.push(leave);
                        }
                    } else {
                        const validLeaveSubSlots: TimeSlot[] = [];
                        for (const leaveSubSlot of (leave as LeaveSlot).slots) {
                            const leaveStart = parse(leaveSubSlot.from, "hh:mm a", new Date());
                            const leaveEnd = parse(leaveSubSlot.to, "hh:mm a", new Date());
                            if (isNaN(leaveStart.getTime()) || isNaN(leaveEnd.getTime())) continue;

                            const isContained = availabilityForDay.timeSlots.some(availableSlot => {
                                const availableStart = parse(availableSlot.from, "hh:mm a", new Date());
                                const availableEnd = parse(availableSlot.to, "hh:mm a", new Date());
                                return isWithinInterval({ start: leaveStart, end: leaveEnd }, { start: availableStart, end: availableEnd });
                            });

                            if (isContained) {
                                validLeaveSubSlots.push(leaveSubSlot);
                            }
                        }
                        if (validLeaveSubSlots.length > 0) {
                            cleanedLeaveSlots.push({ ...(leave as LeaveSlot), slots: validLeaveSubSlots });
                        }
                    }
                }

                await updateDoc(doctorRef, {
                    availabilitySlots: newAvailabilitySlots,
                    schedule: scheduleString,
                    leaveSlots: cleanedLeaveSlots,
                });

                const updatedDoctor = { ...selectedDoctor, availabilitySlots: newAvailabilitySlots, schedule: scheduleString, leaveSlots: cleanedLeaveSlots };
                
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

        const existingLeaveSlots: (LeaveSlot | string)[] = selectedDoctor.leaveSlots || [];
        const cleanedLeaveSlots: (LeaveSlot | string)[] = [];

        for (const leave of existingLeaveSlots) {
            if (typeof leave === 'string') {
                cleanedLeaveSlots.push(leave);
                continue;
            }
            if (!leave.date || !Array.isArray(leave.slots)) continue;

            const leaveDate = parse(leave.date, 'yyyy-MM-dd', new Date());
            if (isNaN(leaveDate.getTime())) continue;

            const dayName = format(leaveDate, 'EEEE');
            if (dayName !== day) {
                cleanedLeaveSlots.push(leave);
                continue;
            }

            const validLeaveSubSlots = leave.slots.filter(leaveSubSlot => {
                return !(leaveSubSlot.from === timeSlot.from && leaveSubSlot.to === timeSlot.to);
            });

            if (validLeaveSubSlots.length > 0) {
                cleanedLeaveSlots.push({ ...leave, slots: validLeaveSubSlots });
            }
        }
    
        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, { 
                    availabilitySlots: updatedAvailabilitySlots,
                    leaveSlots: cleanedLeaveSlots 
                });
                const updatedDoctor = { ...selectedDoctor, availabilitySlots: updatedAvailabilitySlots, leaveSlots: cleanedLeaveSlots };
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

        for (const day of selectedDays) {
            const clinicDay = clinicDetails?.operatingHours?.find((h: any) => h.day === day);
            if (!clinicDay || clinicDay.isClosed) {
                toast({ variant: "destructive", title: "Invalid Day", description: `Clinic is closed on ${day}.` });
                return;
            }
            
            for (const slot of validSharedTimeSlots) {
                let withinHours = false;
                for (const clinicSlot of clinicDay.timeSlots) {
                    if (slot.from >= clinicSlot.open && slot.to <= clinicSlot.close) {
                        withinHours = true;
                        break;
                    }
                }
                if (!withinHours) {
                    toast({ variant: "destructive", title: "Invalid Time Slot", description: `Slot for ${day} is outside clinic operating hours.` });
                    return;
                }
            }
        }
    
        const currentFormSlots = form.getValues('availabilitySlots') || [];
        const newSlotsMap = new Map<string, { day: string; timeSlots: { from: string; to: string }[] }>();
        
        currentFormSlots.forEach(slot => newSlotsMap.set(slot.day, slot));
    
        selectedDays.forEach(day => {
            newSlotsMap.set(day, { day, timeSlots: validSharedTimeSlots });
        });
        
        const updatedSlots = Array.from(newSlotsMap.values());
        form.setValue('availabilitySlots', updatedSlots, { shouldDirty: true, shouldValidate: true });
        
        toast({
            title: "Time Slots Applied",
            description: `The defined time slots have been applied to the selected days.`,
        });
        
        setSelectedDays([]);
    };
  
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

  const isDoctorLimitReached = clinicDetails ? doctors.length >= clinicDetails.numDoctors : false;

  const openAddDoctorDialog = () => {
    setEditingDoctor(null);
    setIsAddDoctorOpen(true);
  };

  const dailyLeaveSlots = useMemo(() => {
    if (!selectedDoctor?.leaveSlots) return [];
  
    const slotsForDate: Date[] = (selectedDoctor.leaveSlots || [])
      .map(leave => {
        // Handle string-based ISO dates
        if (typeof leave === 'string') {
          try {
            const d = parseISO(leave);
            return !isNaN(d.getTime()) && isSameDay(d, leaveCalDate) ? d : null;
          } catch {
            return null;
          }
        }
        // Handle object-based leave slots
        if (leave && leave.date && Array.isArray(leave.slots)) {
            if (isSameDay(parse(leave.date, 'yyyy-MM-dd', new Date()), leaveCalDate)) {
                return leave.slots.flatMap(slot => {
                    const start = parseTimeUtil(slot.from, leaveCalDate);
                    const end = parseTimeUtil(slot.to, leaveCalDate);
                    const consultationTime = selectedDoctor.averageConsultingTime || 15;
                    const innerSlots = [];
                    let current = start;
                    while(isBefore(current, end)) {
                        innerSlots.push(current);
                        current = addMinutes(current, consultationTime);
                    }
                    return innerSlots;
                });
            }
        }
        return null;
      })
      .flat() // Flatten the array of arrays from object slots
      .filter((date): date is Date => date !== null);
  
    if (slotsForDate.length === 0) return [];
  
    slotsForDate.sort((a, b) => a.getTime() - b.getTime());
  
    const combinedBreaks: { start: Date; end: Date }[] = [];
    let currentBreak: { start: Date; end: Date } | null = null;
    const consultationTime = selectedDoctor.averageConsultingTime || 15;
  
    for (const slot of slotsForDate) {
      if (!currentBreak) {
        currentBreak = { start: slot, end: addMinutes(slot, consultationTime) };
      } else if (slot.getTime() === currentBreak.end.getTime()) {
        currentBreak.end = addMinutes(slot, consultationTime);
      } else {
        combinedBreaks.push(currentBreak);
        currentBreak = { start: slot, end: addMinutes(slot, consultationTime) };
      }
    }
    if (currentBreak) {
      combinedBreaks.push(currentBreak);
    }
  
    return combinedBreaks;
  }, [selectedDoctor?.leaveSlots, leaveCalDate, selectedDoctor?.averageConsultingTime]);

  const canCancelBreak = useMemo(() => {
    if (!selectedDoctor || !leaveCalDate || dailyLeaveSlots.length === 0) {
      return false;
    }

    const dayOfWeek = format(leaveCalDate, 'EEEE');
    const availabilityForDay = selectedDoctor.availabilitySlots?.find(
      (slot) => slot.day === dayOfWeek
    );

    if (!availabilityForDay?.timeSlots?.length) {
      return true;
    }

    let earliestStart: Date | null = null;
    for (const slot of availabilityForDay.timeSlots) {
      const start = parseTimeUtil(slot.from, leaveCalDate);
      if (!earliestStart || start.getTime() < earliestStart.getTime()) {
        earliestStart = start;
      }
    }

    if (!earliestStart) {
      return true;
    }

    const minutesUntilStart = differenceInMinutes(earliestStart, new Date());
    return minutesUntilStart >= 60;
  }, [selectedDoctor, leaveCalDate, dailyLeaveSlots]);

  const allTimeSlotsForDay = useMemo((): Date[] => {
    if (!selectedDoctor || !leaveCalDate) return [];
    const dayOfWeek = format(leaveCalDate, 'EEEE');
    const doctorAvailabilityForDay = selectedDoctor.availabilitySlots?.find(slot => slot.day === dayOfWeek);
    if (!doctorAvailabilityForDay) return [];

    const slots: Date[] = [];
    const consultationTime = selectedDoctor.averageConsultingTime || 15;

    doctorAvailabilityForDay.timeSlots.forEach(timeSlot => {
        let currentTime = parseTimeUtil(timeSlot.from, leaveCalDate);
        const endTime = parseTimeUtil(timeSlot.to, leaveCalDate);
        while (currentTime < endTime) {
            slots.push(new Date(currentTime));
            currentTime = addMinutes(currentTime, consultationTime);
        }
    });
    return slots;
  }, [selectedDoctor, leaveCalDate]);

  const slotsInSelection = useMemo(() => {
    if (!startSlot || !endSlot || !selectedDoctor) return [];
    const slots: Date[] = [];
    let currentTime = new Date(startSlot);
    const consultationTime = selectedDoctor.averageConsultingTime || 15;
    
    while (currentTime <= endSlot) {
        slots.push(new Date(currentTime));
        currentTime = addMinutes(currentTime, consultationTime);
    }
    return slots;
  }, [startSlot, endSlot, selectedDoctor]);

  const handleSlotClick = (slot: Date) => {
    if (dailyLeaveSlots.some(breakPeriod => isWithinInterval(slot, { start: breakPeriod.start, end: breakPeriod.end }))) return;

    if (!startSlot || endSlot) {
        setStartSlot(slot);
        setEndSlot(null);
    } else if (slot > startSlot) {
        setEndSlot(slot);
    } else {
        setStartSlot(slot);
        setEndSlot(null);
    }
  };

  const handleConfirmBreak = async () => {
    if (!startSlot || !endSlot || !selectedDoctor || !auth.currentUser || !leaveCalDate) {
        toast({ variant: 'destructive', title: 'Invalid Selection', description: 'Please select a valid start and end time.' });
        return;
    }
    
    // Calculate extension options before showing dialog
    const consultationTime = selectedDoctor.averageConsultingTime || 15;
    const breakDuration = differenceInMinutes(endSlot, startSlot) + consultationTime;
    
    const dayOfWeek = format(leaveCalDate, 'EEEE');
    const availabilityForDay = (selectedDoctor.availabilitySlots || []).find(slot => slot.day === dayOfWeek);
    
    let hasOverrun = false;
    let minimalExtension = 0;
    let lastTokenBefore = '';
    let lastTokenAfter = '';
    let originalEnd = '';
    
    if (availabilityForDay && availabilityForDay.timeSlots.length > 0) {
        const lastSession = availabilityForDay.timeSlots[availabilityForDay.timeSlots.length - 1];
        originalEnd = lastSession.to;
        const originalEndTimeDate = parseTimeUtil(originalEnd, leaveCalDate);
        
        const dateStr = format(leaveCalDate, 'd MMMM yyyy');
        const appointmentsOnDate = appointments.filter(
            (apt) => apt.doctor === selectedDoctor.name && apt.date === dateStr
        );
        
        if (appointmentsOnDate.length > 0) {
            const sortedByTime = [...appointmentsOnDate].sort((a, b) => {
                const timeA = parseTimeUtil(a.time, leaveCalDate).getTime();
                const timeB = parseTimeUtil(b.time, leaveCalDate).getTime();
                return timeA - timeB;
            });
            
            const lastAppointment = sortedByTime[sortedByTime.length - 1];
            const lastBaseTime = parseTimeUtil(lastAppointment.time, leaveCalDate);
            lastTokenBefore = format(lastBaseTime, 'hh:mm a');
            
            const lastTimeAfterBreak = addMinutes(lastBaseTime, breakDuration);
            lastTokenAfter = format(lastTimeAfterBreak, 'hh:mm a');
            
            const overrunMinutes = Math.max(0, differenceInMinutes(lastTimeAfterBreak, originalEndTimeDate));
            hasOverrun = overrunMinutes > 0;
            minimalExtension = overrunMinutes;
        }
    }
    
    setExtensionOptions({
        hasOverrun,
        minimalExtension,
        fullExtension: breakDuration,
        lastTokenBefore,
        lastTokenAfter,
        originalEnd,
        breakDuration
    });
    
    // Show dialog to ask about extending availability
    setPendingBreakData({ startSlot, endSlot });
    setShowExtensionDialog(true);
  };

  const confirmBreakWithExtension = async (extensionMinutes: number | null) => {
    if (!pendingBreakData || !selectedDoctor || !leaveCalDate) {
        setShowExtensionDialog(false);
        setPendingBreakData(null);
        return;
    }

    const { startSlot, endSlot } = pendingBreakData;
    setIsSubmittingBreak(true);
    setShowExtensionDialog(false);
    setPendingBreakData(null);
    setExtensionOptions(null);
    
    try {
        const doctorRef = doc(db, 'doctors', selectedDoctor.id);
        const consultationTime = selectedDoctor.averageConsultingTime || 15;
        const slotsInBreak: Date[] = [];
        let currentTime = new Date(startSlot);
        while (currentTime <= endSlot) {
            slotsInBreak.push(new Date(currentTime));
            currentTime = addMinutes(currentTime, consultationTime);
        }
        const newLeaveSlotsISO = slotsInBreak.map(slot => slot.toISOString());
        
        const existingLeaveSlots = selectedDoctor.leaveSlots || [];
        const updatedLeaveSlots = [...existingLeaveSlots, ...newLeaveSlotsISO];
        
        // Handle availability extension if user chose to extend
        const doctorUpdates: any = { leaveSlots: updatedLeaveSlots };
        
        if (extensionMinutes !== null && extensionMinutes > 0) {
            const dayOfWeek = format(leaveCalDate, 'EEEE');
            const availabilityForDay = (selectedDoctor.availabilitySlots || []).find(slot => slot.day === dayOfWeek);
            
            if (availabilityForDay && availabilityForDay.timeSlots.length > 0) {
                // Get the last session's end time (original availability end)
                const lastSession = availabilityForDay.timeSlots[availabilityForDay.timeSlots.length - 1];
                const originalEndTime = lastSession.to;
                const originalEndTimeDate = parseTimeUtil(originalEndTime, leaveCalDate);
                
                const newEndTimeDate = addMinutes(originalEndTimeDate, extensionMinutes);
                const newEndTime = format(newEndTimeDate, 'hh:mm a');
                
                const dateStr = format(leaveCalDate, 'd MMMM yyyy');
                const availabilityExtensions = selectedDoctor.availabilityExtensions || {};
                const existingExtension = availabilityExtensions[dateStr];
                availabilityExtensions[dateStr] = {
                    extendedBy: (existingExtension?.extendedBy || 0) + extensionMinutes,
                    originalEndTime: existingExtension?.originalEndTime || originalEndTime,
                    newEndTime,
                };
                doctorUpdates.availabilityExtensions = availabilityExtensions;
            }
        }
        
        await updateDoc(doctorRef, doctorUpdates);

        toast({ title: 'Break Scheduled', description: 'Break has been saved for this doctor.'});
        const updatedDoctor = { ...selectedDoctor, leaveSlots: updatedLeaveSlots, availabilityExtensions: doctorUpdates.availabilityExtensions };
        setSelectedDoctor(updatedDoctor);
        setDoctors(prev => prev.map(d => d.id === updatedDoctor.id ? updatedDoctor : d));
        setStartSlot(null);
        setEndSlot(null);

    } catch (error) {
        console.error("Error scheduling break:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to schedule break.' });
    } finally {
        setIsSubmittingBreak(false);
    }
  };

  const handleCancelBreak = async () => {
    console.log('========================================');
    console.log('[BREAK CANCELLATION] ====== STARTING BREAK CANCELLATION ======');
    console.log('[BREAK CANCELLATION] Function called with:', {
      hasSelectedDoctor: !!selectedDoctor,
      hasLeaveCalDate: !!leaveCalDate,
      dailyLeaveSlotsLength: dailyLeaveSlots.length,
      selectedDoctorName: selectedDoctor?.name,
      leaveCalDateStr: leaveCalDate ? format(leaveCalDate, 'd MMMM yyyy') : 'N/A',
    });
    console.log('========================================');
    
    if (!selectedDoctor || !leaveCalDate || dailyLeaveSlots.length === 0) {
        console.error('[BREAK CANCELLATION] ❌ Validation failed - missing required data');
        toast({ variant: 'destructive', title: 'Error', description: 'No break found to cancel.' });
        return;
    }
  
    setIsSubmittingBreak(true);
    console.log('[BREAK CANCELLATION] Starting break cancellation process...');
    try {
        const doctorRef = doc(db, 'doctors', selectedDoctor.id);

        // Calculate break duration for updating appointments
        const consultationTime = selectedDoctor.averageConsultingTime || 15;
        const breakStart = new Date(Math.min(...dailyLeaveSlots.map(bp => bp.start.getTime())));
        const breakEndBase = new Date(Math.max(...dailyLeaveSlots.map(bp => bp.end.getTime())));
        const breakEnd = addMinutes(breakEndBase, consultationTime);
        const fullBreakDuration = differenceInMinutes(breakEnd, breakStart);
        
        console.log(`[BREAK CANCELLATION] Break details:`, {
            breakStart: format(breakStart, 'hh:mm a'),
            breakEnd: format(breakEnd, 'hh:mm a'),
            breakEndBase: format(breakEndBase, 'hh:mm a'),
            fullBreakDuration,
            consultationTime,
            dateStr: format(leaveCalDate, 'd MMMM yyyy'),
        });

        // Expand all combined break intervals into individual slot times for the day
        const allBreakSlotISOsForDay: string[] = dailyLeaveSlots.flatMap(breakPeriod => {
            const slots: string[] = [];
            let current = new Date(breakPeriod.start);
            while (isBefore(current, breakPeriod.end)) {
                slots.push(current.toISOString());
                current = addMinutes(current, consultationTime);
            }
            return slots;
        });

        const updatedLeaveSlots = (selectedDoctor.leaveSlots || []).filter(leave => {
            if (typeof leave === 'string') {
                // Remove any stored leave slot that belongs to this day's break intervals
                return !allBreakSlotISOsForDay.includes(leave);
            }

            // For legacy object-based leave slots, remove those that match this date
            if (leave && (leave as any).date) {
                try {
                    const leaveDate = parse((leave as any).date, 'yyyy-MM-dd', new Date());
                    if (isSameDay(leaveDate, leaveCalDate)) {
                        return false;
                    }
                } catch {
                    // If parsing fails, keep the record to avoid accidental data loss
                    return true;
                }
            }

            return true;
        });

        // Handle availability extension removal and update appointments
        const dateStr = format(leaveCalDate, 'd MMMM yyyy');
        console.log(`[BREAK CANCELLATION] Querying appointments for:`, {
            doctor: selectedDoctor.name,
            clinicId: selectedDoctor.clinicId,
            date: dateStr,
        });
        
        const appointmentsQuery = query(
            collection(db, 'appointments'),
            where('doctor', '==', selectedDoctor.name),
            where('clinicId', '==', selectedDoctor.clinicId),
            where('date', '==', dateStr)
        );
        const appointmentsSnapshot = await getDocs(appointmentsQuery);
        
        console.log(`[BREAK CANCELLATION] Found ${appointmentsSnapshot.docs.length} appointments for date ${dateStr}`);
        
        if (appointmentsSnapshot.docs.length > 0) {
            console.log(`[BREAK CANCELLATION] Appointment details:`, 
                appointmentsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    time: doc.data().time,
                    arriveByTime: doc.data().arriveByTime,
                    cutOffTime: doc.data().cutOffTime,
                    noShowTime: doc.data().noShowTime,
                }))
            );
        }

        const appointmentsToUpdate: {
            id: string;
            adjustedArriveByTime: string;
            newCutOffTime: Date;
            newNoShowTime: Date;
        }[] = [];

        appointmentsSnapshot.docs.forEach(docSnap => {
            const appt = docSnap.data() as Appointment;
            if (!appt.time) {
                console.log(`[BREAK CANCELLATION] Appointment ${docSnap.id} has no time field`);
                return;
            }
            
            try {
                const apptTime = parseTimeUtil(appt.time, leaveCalDate);
                const isAfterOrAtBreakStart = apptTime >= breakStart;
                
                console.log(`[BREAK CANCELLATION] Checking appointment ${docSnap.id}:`, {
                    appointmentTime: appt.time,
                    parsedApptTime: format(apptTime, 'hh:mm a'),
                    breakStart: format(breakStart, 'hh:mm a'),
                    isAfterOrAtBreakStart,
                    currentArriveByTime: appt.arriveByTime,
                });

                // Update all appointments at or after the break start (these would have had break offsets applied)
                // Recalculate arriveByTime, cutOffTime, and noShowTime from the original time (without break offsets)
                if (isAfterOrAtBreakStart) {
                    // Use the original appointment time (no break offsets) to recalculate times
                    // arriveByTime: no -15 minutes (just the original time)
                    // cutOffTime: still has -15 minutes
                    // noShowTime: still has +15 minutes
                    const adjustedArriveByTime = format(apptTime, 'hh:mm a');
                    const newCutOffTime = subMinutes(apptTime, 15);
                    const newNoShowTime = addMinutes(apptTime, 15);
                    appointmentsToUpdate.push({
                        id: docSnap.id,
                        adjustedArriveByTime,
                        newCutOffTime,
                        newNoShowTime,
                    });
                    console.log(`[BREAK CANCELLATION] Appointment ${docSnap.id} will be updated:`, {
                        originalTime: appt.time,
                        apptTime: format(apptTime, 'hh:mm a'),
                        breakStart: format(breakStart, 'hh:mm a'),
                        newArriveByTime: adjustedArriveByTime,
                        newCutOffTime: format(newCutOffTime, 'hh:mm a'),
                        newNoShowTime: format(newNoShowTime, 'hh:mm a'),
                    });
                }
            } catch (error) {
                console.error(`[BREAK CANCELLATION] Error processing appointment ${docSnap.id}:`, error);
            }
        });

        console.log(`[BREAK CANCELLATION] Found ${appointmentsToUpdate.length} appointments to update`);

        const batch = writeBatch(db);

        // Update affected appointments
        for (const appt of appointmentsToUpdate) {
            try {
                const apptRef = doc(db, 'appointments', appt.id);
                batch.update(apptRef, {
                    // Do NOT touch 'time' field – keep original slot time
                    arriveByTime: appt.adjustedArriveByTime,
                    cutOffTime: Timestamp.fromDate(appt.newCutOffTime),
                    noShowTime: Timestamp.fromDate(appt.newNoShowTime),
                });
                console.log(`[BREAK CANCELLATION] Added update to batch for appointment ${appt.id}`);
            } catch (error) {
                console.error(`[BREAK CANCELLATION] Error adding update to batch for appointment ${appt.id}:`, error);
            }
        }

        const doctorUpdates: any = { leaveSlots: updatedLeaveSlots };
        const extension = selectedDoctor.availabilityExtensions?.[dateStr];
        
        if (extension) {
            // Check if any appointments exist in the extended time
            const originalEndTimeDate = parseTimeUtil(extension.originalEndTime, leaveCalDate);
            const extendedEndTimeDate = parseTimeUtil(extension.newEndTime, leaveCalDate);
            
            const hasAppointmentsInExtendedTime = appointmentsSnapshot.docs.some(docSnap => {
                const appt = docSnap.data() as Appointment;
                if (!appt.time) return false;
                const apptTime = parseTimeUtil(appt.time, leaveCalDate);
                return apptTime >= originalEndTimeDate && apptTime < extendedEndTimeDate;
            });
            
            if (!hasAppointmentsInExtendedTime) {
                // Safe to remove extension - no appointments in extended time
                const availabilityExtensions = { ...selectedDoctor.availabilityExtensions };
                delete availabilityExtensions[dateStr];
                doctorUpdates.availabilityExtensions = availabilityExtensions;
            } else {
                // Keep extension to avoid disrupting appointments
                doctorUpdates.availabilityExtensions = selectedDoctor.availabilityExtensions;
            }
        }

        // Update doctor document
        batch.update(doctorRef, doctorUpdates);
        
        if (appointmentsToUpdate.length === 0) {
            console.warn('[BREAK CANCELLATION] WARNING: No appointments found to update! This might be expected if no appointments were affected by the break.');
        } else {
            console.log(`[BREAK CANCELLATION] Committing batch with ${appointmentsToUpdate.length} appointment updates and doctor update`);
        }
        
        await batch.commit();
        console.log(`[BREAK CANCELLATION] ✅ Batch committed successfully`);
        
        if (appointmentsToUpdate.length > 0) {
            console.log(`[BREAK CANCELLATION] ✅ Successfully updated ${appointmentsToUpdate.length} appointment(s) in database`);
        } else {
            console.log(`[BREAK CANCELLATION] ℹ️ No appointments needed updating (break may not have affected any appointments)`);
        }

        // Send notifications to affected patients (only if some appointments changed)
        if (appointmentsToUpdate.length > 0) {
            try {
                const { sendBreakUpdateNotification } = await import('@/lib/notification-service');

                const clinicDoc = await getDoc(doc(db, 'clinics', selectedDoctor.clinicId));
                const clinicData = clinicDoc.data();
                const clinicName = clinicData?.name || 'The clinic';

                const originalAppointments = appointmentsSnapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                })) as (Appointment & { id: string })[];

                for (const update of appointmentsToUpdate) {
                    const apptData = originalAppointments.find(a => a.id === update.id);
                    if (!apptData || !apptData.patientId) continue;

                    await sendBreakUpdateNotification({
                        firestore: db,
                        patientId: apptData.patientId,
                        appointmentId: apptData.id,
                        doctorName: apptData.doctor,
                        clinicName,
                        oldTime: apptData.time,
                        newTime: update.adjustedArriveByTime,
                        oldDate: apptData.date,
                        newDate: apptData.date,
                        reason: 'Break cancelled',
                        oldArriveByTime: apptData.arriveByTime,
                        newArriveByTime: update.adjustedArriveByTime,
                    });
                }
            } catch (notifError) {
                console.error('Failed to send break cancel notifications:', notifError);
                // Do not fail cancellation if notifications fail
            }
        }

        toast({ 
            title: 'Break Canceled', 
            description: `The break has been removed and appointments have been rescheduled.${appointmentsToUpdate.length > 0 ? ` ${appointmentsToUpdate.length} patient(s) notified.` : ''}`
        });
        const updatedDoctor = { 
            ...selectedDoctor, 
            leaveSlots: updatedLeaveSlots,
            availabilityExtensions: doctorUpdates.availabilityExtensions
        };
        setSelectedDoctor(updatedDoctor);
        setDoctors(prev => prev.map(d => d.id === updatedDoctor.id ? updatedDoctor : d));
        setStartSlot(null);
        setEndSlot(null);

    } catch (error) {
        console.error("[BREAK CANCELLATION] Error canceling break:", error);
        console.error("[BREAK CANCELLATION] Error details:", {
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            appointmentsToUpdateCount: appointmentsToUpdate.length,
        });
        toast({ 
            variant: 'destructive', 
            title: 'Error', 
            description: `Failed to cancel break. ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
    } finally {
        setIsSubmittingBreak(false);
    }
  };

  const todaysAppointmentsCount = useMemo(() => {
    if (!selectedDoctor) return 0;
    const todayStr = format(new Date(), 'd MMMM yyyy');
    return appointments.filter(apt => apt.doctor === selectedDoctor.name && apt.date === todayStr).length;
  }, [appointments, selectedDoctor]);

  const getCurrentSessionIndex = () => {
    if (!selectedDoctor?.availabilitySlots) return undefined;
    const todayDay = format(new Date(), 'EEEE');
    const todaysAvailability = selectedDoctor.availabilitySlots.find(s => s.day === todayDay);
    if (!todaysAvailability?.timeSlots?.length) return undefined;

    const now = new Date();
    for (let i = 0; i < todaysAvailability.timeSlots.length; i++) {
      const session = todaysAvailability.timeSlots[i];
      const sessionStart = parseTimeUtil(session.from, now);
      const sessionEnd = parseTimeUtil(session.to, now);
      const windowStart = subMinutes(sessionStart, 30);
      if (now >= windowStart && now <= sessionEnd) {
        return i;
      }
    }
    return undefined;
  };

  const handleConsultationStatusToggle = useCallback(async () => {
    if (!selectedDoctor || selectedDoctor.consultationStatus === 'In') {
      return;
    }

    const sessionIndex = getCurrentSessionIndex();
    if (sessionIndex === undefined) {
      toast({
        variant: 'destructive',
        title: 'Outside Session Window',
        description: 'Consultation can be started only during an active session.',
      });
      return;
    }

    setIsUpdatingConsultationStatus(true);
    try {
      await updateDoc(doc(db, 'doctors', selectedDoctor.id), {
        consultationStatus: 'In',
        updatedAt: new Date(),
      });
      setSelectedDoctor(prev => {
        if (!prev || prev.id !== selectedDoctor.id) return prev;
        return { ...prev, consultationStatus: 'In' };
      });
      setDoctors(prev =>
        prev.map(docItem =>
          docItem.id === selectedDoctor.id ? { ...docItem, consultationStatus: 'In' } : docItem
        )
      );

      if (selectedDoctor.clinicId) {
        const clinicDocRef = doc(db, 'clinics', selectedDoctor.clinicId);
        const clinicDoc = await getDoc(clinicDocRef).catch(() => null);
        const clinicName = clinicDoc?.data()?.name || 'The clinic';
        const { notifySessionPatientsOfConsultationStart } = await import('@/lib/notification-service');
        const today = format(new Date(), 'd MMMM yyyy');

        await notifySessionPatientsOfConsultationStart({
          firestore: db,
          clinicId: selectedDoctor.clinicId,
          clinicName,
          doctorName: selectedDoctor.name,
          date: today,
          sessionIndex,
        });
      }

      toast({
        title: 'Status updated',
        description: 'Consultation status set to In.',
      });
    } catch (error) {
      console.error('Error updating consultation status:', error);
      toast({ variant: 'destructive', title: 'Failed to update status', description: 'Please try again.' });
    } finally {
      setIsUpdatingConsultationStatus(false);
    }
  }, [selectedDoctor, setDoctors, setSelectedDoctor, toast]);


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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={cn(isDoctorLimitReached && "cursor-not-allowed")}>
                              <Button onClick={openAddDoctorDialog} disabled={isDoctorLimitReached}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Add Doctor
                              </Button>
                            </div>
                          </TooltipTrigger>
                          {isDoctorLimitReached && (
                            <TooltipContent>
                              <p>Doctor limit reached. Go to Profile &gt; Clinic Details to increase the limit.</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
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
                          {clinicDepartments.map(dept => (
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
            <div className="bg-primary text-primary-foreground rounded-lg p-4 grid grid-cols-[auto,1fr,1fr,auto] items-start gap-6 mb-6">
                {/* Column 1: Image and Basic Info */}
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Image
                            src={photoPreview || selectedDoctor.avatar}
                            alt={selectedDoctor.name}
                            width={112}
                            height={112}
                            className="rounded-md object-cover"
                            data-ai-hint="doctor portrait"
                        />
                         {isEditingDetails && (
                            <label htmlFor="photo-upload" className="absolute inset-0 bg-black/50 flex items-center justify-center text-white rounded-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                                <Upload className="h-6 w-6" />
                            </label>
                        )}
                        <input type="file" id="photo-upload" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    </div>
                    <div className="space-y-1">
                        {isEditingDetails ? (
                           <>
                           <Input 
                               value={newName} 
                               onChange={(e) => setNewName(e.target.value)} 
                               className="text-2xl font-bold h-10 bg-transparent border-white/50 placeholder:text-primary-foreground/70"
                               disabled={isPending}
                               placeholder="Doctor Name"
                           />
                           <Input
                                value={newRegistrationNumber}
                                onChange={(e) => setNewRegistrationNumber(e.target.value)}
                                className="text-sm h-8 bg-transparent border-white/50 placeholder:text-primary-foreground/70"
                                placeholder="Registration No."
                                disabled={isPending}
                            />
                           <Input 
                               value={newSpecialty} 
                               onChange={(e) => setNewSpecialty(e.target.value)} 
                               className="text-md h-9 bg-transparent border-white/50 placeholder:text-primary-foreground/70"
                               disabled={isPending}
                               placeholder="Specialty"
                           />
                           <Select onValueChange={setNewDepartment} value={newDepartment}>
                               <SelectTrigger className="w-[200px] h-9 bg-transparent border-white/50">
                                   <SelectValue placeholder="Select department" />
                               </SelectTrigger>
                               <SelectContent>
                                   {clinicDepartments.map(dept => (
                                       <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                                   ))}
                               </SelectContent>
                           </Select>
                       </>
                        ) : (
                            <>
                                <p className="font-bold text-2xl">{selectedDoctor.name}</p>
                                {selectedDoctor.registrationNumber && <p className="text-xs opacity-80">{selectedDoctor.registrationNumber}</p>}
                                <p className="text-md opacity-90">{selectedDoctor.specialty}</p>
                                <p className="text-sm opacity-90">{(selectedDoctor.degrees || []).join(', ')}{selectedDoctor.degrees && selectedDoctor.department ? ' - ' : ''}{selectedDoctor.department}</p>
                            </>
                        )}
                    </div>
                </div>

                {/* Column 2: Experience */}
                <div className="flex flex-col items-center pt-6">
                    <div className="mb-2">
                        <Trophy className="w-4 h-4 text-yellow-400" />
                    </div>
                    {isEditingDetails ? (
                        <div className="flex items-center gap-2">
                            <span className="opacity-90">Years:</span>
                            <div className="flex items-center">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => setNewExperience(prev => Math.max(0, Number(prev) - 1))} disabled={isPending}>
                                    <Minus className="h-4 w-4"/>
                                </Button>
                                <Input 
                                    type="number"
                                    value={newExperience} 
                                    onChange={(e) => setNewExperience(e.target.value)} 
                                    className="w-16 h-9 bg-transparent border-white/50 placeholder:text-primary-foreground/70 text-center"
                                    placeholder="Years"
                                    disabled={isPending}
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => setNewExperience(prev => Number(prev) + 1)} disabled={isPending}>
                                    <PlusCircle className="h-4 w-4"/>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="text-2xl font-bold">{selectedDoctor.experience}</p>
                            <p className="text-sm opacity-90">Years of experience</p>
                        </div>
                    )}
                </div>

                 {/* Column 3: Reviews */}
                 <div className="flex flex-col items-center pt-6">
                    <div className="mb-2">
                        <Star className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div className="flex items-center gap-2">
                        <StarRating rating={selectedDoctor.rating || 0} />
                    </div>
                    <span className="text-md opacity-90 mt-2">({selectedDoctor.reviews}+ Reviews)</span>
                </div>

                {/* Column 4: Actions */}
                <div className="flex flex-col items-end justify-between self-stretch">
                    {!isEditingDetails && (
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setIsEditingDetails(true)}>
                            <Edit className="h-5 w-5" />
                        </Button>
                    )}
                     {isEditingDetails && (
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" className="text-white hover:bg-white/20" onClick={() => {setIsEditingDetails(false); setPhotoPreview(selectedDoctor.avatar); setNewPhoto(null);}} disabled={isPending}>Cancel</Button>
                            <Button size="sm" className="bg-white text-primary hover:bg-white/90" onClick={handleDetailsSave} disabled={isPending}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                Save
                            </Button>
                        </div>
                    )}
                    <div className="flex-grow"></div>
                    <div className="flex flex-col items-end gap-2">
                      <Button
                        variant="secondary"
                        disabled={isUpdatingConsultationStatus || selectedDoctor.consultationStatus === 'In'}
                        onClick={handleConsultationStatusToggle}
                        className={cn(
                          'flex items-center gap-3 rounded-full px-4 py-2 text-white border-none shadow-md transition-colors',
                          selectedDoctor.consultationStatus === 'In'
                            ? 'bg-green-500'
                            : 'bg-red-500 hover:bg-red-600',
                          isUpdatingConsultationStatus && 'opacity-70 cursor-not-allowed'
                        )}
                      >
                        <div className="relative flex h-3 w-3">
                          {selectedDoctor.consultationStatus === 'In' && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                          )}
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                        </div>
                        <span className="font-semibold">
                          {isUpdatingConsultationStatus
                            ? 'Updating...'
                            : selectedDoctor.consultationStatus === 'In'
                            ? 'Doctor Online'
                            : 'Mark as In'}
                        </span>
                      </Button>
                      <span className="text-xs uppercase tracking-wide text-white/80">
                        Current: {selectedDoctor.consultationStatus || 'Out'}
                      </span>
                   </div>
                </div>
            </div>

            {activeTab !== 'analytics' && (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6">
                  <div className="grid grid-cols-2 gap-6">
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
                                        placeholder="min"
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
                            <span className="text-muted-foreground font-bold">₹</span>
                        </CardHeader>
                        <CardContent>
                            {isEditingFee ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <Input 
                                        type="number" 
                                        value={newFee} 
                                        onChange={(e) => setNewFee(e.target.value)} 
                                        className="w-20 h-8"
                                        placeholder="₹"
                                        disabled={isPending}
                                        min="0"
                                    />
                                    <Button size="icon" className="h-8 w-8" onClick={handleFeeSave} disabled={isPending}><Save className="h-4 w-4"/></Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {setIsEditingFee(false); setNewFee(selectedDoctor.consultationFee || "")}} disabled={isPending}><X className="h-4 w-4"/></Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <p className="text-2xl font-bold">₹{selectedDoctor.consultationFee || 0}</p>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingFee(true)}><Edit className="h-3 w-3"/></Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Free Follow-up</CardTitle>
                          <Repeat className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                          {isEditingFollowUp ? (
                            <div className="flex items-center gap-2 mt-1">
                                <Input type="number" min="0" value={newFollowUp} onChange={(e) => setNewFollowUp(e.target.value)} className="w-20 h-8" placeholder="days" disabled={isPending} />
                                <Button size="icon" className="h-8 w-8" onClick={handleFollowUpSave} disabled={isPending}><Save className="h-4 w-4"/></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {setIsEditingFollowUp(false); setNewFollowUp(selectedDoctor.freeFollowUpDays || 0)}} disabled={isPending}><X className="h-4 w-4"/></Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                                <p className="text-2xl font-bold">{selectedDoctor.freeFollowUpDays || 0} {(selectedDoctor.freeFollowUpDays || 0) === 1 ? 'day' : 'days'}</p>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingFollowUp(true)}><Edit className="h-3 w-3"/></Button>
                            </div>
                          )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Advance Booking</CardTitle>
                          <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                          {isEditingBooking ? (
                            <div className="flex items-center gap-2 mt-1">
                                <Input type="number" min="0" value={newBooking} onChange={(e) => setNewBooking(e.target.value)} className="w-20 h-8" placeholder="days" disabled={isPending} />
                                <Button size="icon" className="h-8 w-8" onClick={handleBookingSave} disabled={isPending}><Save className="h-4 w-4"/></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {setIsEditingBooking(false); setNewBooking(selectedDoctor.advanceBookingDays || 0)}} disabled={isPending}><X className="h-4 w-4"/></Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="text-2xl font-bold">{selectedDoctor.advanceBookingDays || 0} {(selectedDoctor.advanceBookingDays || 0) === 1 ? 'day' : 'days'}</div>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingBooking(true)}><Edit className="h-3 w-3"/></Button>
                            </div>
                          )}
                      </CardContent>
                    </Card>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
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
                        <CardContent className="flex items-center justify-center">
                            <div className="text-2xl font-bold">{todaysAppointmentsCount}</div>
                        </CardContent>
                    </Card>
                  </div>
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
                                            placeholder="Enter a short bio for the doctor..."
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
                                <CardTitle className="flex items-center gap-2"><CalendarIcon className="w-5 h-5" /> Schedule Break</CardTitle>
                                <CardDescription>Select a date and time range to schedule a break. This will reschedule existing appointments.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <Calendar
                                  mode="single"
                                  selected={leaveCalDate}
                                  onSelect={(d) => { if (d) { setLeaveCalDate(d); setStartSlot(null); setEndSlot(null); } }}
                                  disabled={(date) => (isPast(date) && !isSameDay(date, new Date())) || !selectedDoctor.availabilitySlots?.some(s => s.day === format(date, 'EEEE'))}
                                  initialFocus
                               />
                                <div className="p-4 border rounded-md h-full flex flex-col">
                                    <h3 className="font-semibold mb-2">
                                        Slots for {format(leaveCalDate, "MMM d")}
                                    </h3>
                                    <div className="space-y-2 flex-grow overflow-y-auto">
                                        <div className="grid grid-cols-3 gap-2">
                                            {allTimeSlotsForDay.map((slot) => {
                                                const isSelected = (startSlot && slot >= startSlot && endSlot && slot <= endSlot) || (startSlot?.getTime() === slot.getTime() && !endSlot);
                                                const isOnLeave = dailyLeaveSlots.some(breakPeriod => isWithinInterval(slot, { start: breakPeriod.start, end: addMinutes(breakPeriod.end, -1) }));
                                                const isBooked = allBookedSlots.includes(slot.getTime());

                                                return (
                                                    <Button
                                                        key={slot.toISOString()}
                                                        variant={isSelected ? 'default' : 'outline'}
                                                        className={cn("h-auto py-2 flex-col", {
                                                          'bg-destructive/80 hover:bg-destructive text-white': isSelected,
                                                          'bg-red-200 text-red-800 border-red-300 cursor-not-allowed': isOnLeave,
                                                          'hover:bg-accent': !isSelected && !isOnLeave,
                                                        })}
                                                        onClick={() => handleSlotClick(slot)}
                                                        disabled={isOnLeave}
                                                    >
                                                        <span className="font-semibold">{format(slot, 'hh:mm a')}</span>
                                                        {isBooked && !isOnLeave && <span className="text-xs">Booked</span>}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                         {allTimeSlotsForDay.length === 0 && <p className="text-sm text-muted-foreground text-center pt-4">No slots available for this day.</p>}
                                    </div>
                                    <div className="text-center mt-4 mb-2 text-sm text-muted-foreground">
                                        {dailyLeaveSlots.length > 0 ? (
                                            dailyLeaveSlots.map((breakPeriod, index) => (
                                              <div key={index}>Break: {format(breakPeriod.start, 'hh:mm a')} - {format(breakPeriod.end, 'hh:mm a')}</div>
                                            ))
                                        ) : startSlot && !endSlot ? (
                                            "Select an end time for the break."
                                        ) : startSlot && endSlot ? (
                                            `New break: ${format(startSlot, 'hh:mm a')} to ${format(addMinutes(endSlot, (selectedDoctor.averageConsultingTime || 15)), 'hh:mm a')}`
                                        ) : (
                                        "Select a start and end time for the break."
                                        )}
                                      </div>
                                    {dailyLeaveSlots.length > 0 ? (
                                        <Button
                                          className="w-full"
                                          variant="secondary"
                                          disabled={isSubmittingBreak || !canCancelBreak}
                                          onClick={handleCancelBreak}
                                        >
                                            {isSubmittingBreak ? <Loader2 className="animate-spin" /> : 'Cancel This Break'}
                                        </Button>
                                    ) : (
                                        <Button className="w-full" variant="destructive" disabled={!startSlot || !endSlot || isSubmittingBreak} onClick={handleConfirmBreak}>
                                            {isSubmittingBreak ? <Loader2 className="animate-spin" /> : 'Confirm Break'}
                                        </Button>
                                    )}
                                </div>
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
                                    <Button variant="outline" size="sm" onClick={handleEditAvailability}>
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
                                            {daysOfWeek.map((day, index) => {
                                                const clinicDay = clinicDetails?.operatingHours?.find((h: any) => h.day === day);
                                                const isDisabled = !clinicDay || clinicDay.isClosed;
                                                return (
                                                <ToggleGroupItem key={daysOfWeek[index]} value={daysOfWeek[index]} aria-label={`Toggle ${daysOfWeek[index]}`} className="h-9 w-9" disabled={isDisabled}>
                                                    {dayAbbreviations[index]}
                                                </ToggleGroupItem>
                                                )
                                            })}
                                        </ToggleGroup>
                                      </div>

                                        <div className="space-y-2">
                                            <Label>2. Define time slots</Label>
                                            {sharedTimeSlots.map((ts, index) => {
                                                const dayForSlot = selectedDays[0] || daysOfWeek.find(day => !clinicDetails?.operatingHours?.find((h:any) => h.day === day)?.isClosed);
                                                const clinicDay = clinicDetails?.operatingHours?.find((h: any) => h.day === dayForSlot);
                                                if (!clinicDay) return null;

                                                const clinicOpeningTime = clinicDay.timeSlots[0]?.open || "00:00";
                                                const clinicClosingTime = clinicDay.timeSlots[clinicDay.timeSlots.length - 1]?.close || "23:45";
                                                const allTimeOptions = generateTimeOptions(clinicOpeningTime, clinicClosingTime, 15);
                                                
                                                const fromTimeOptions = allTimeOptions.filter(time => 
                                                  !sharedTimeSlots.filter((_, i) => i !== index).some(slot => time >= slot.from && time < slot.to)
                                                ).slice(0, -1);

                                                const nextSlotStart = [...sharedTimeSlots]
                                                    .filter(slot => slot.from > ts.from)
                                                    .sort((a,b) => a.from.localeCompare(b.from))[0]?.from || clinicClosingTime;
                                                
                                                const toTimeOptions = ts.from 
                                                    ? allTimeOptions.filter(t => t > ts.from && t <= nextSlotStart) 
                                                    : [];

                                               return (
                                                <div key={index} className="flex items-end gap-2">
                                                   <div className="flex-grow space-y-1">
                                                      <Label className="text-xs font-normal">From</Label>
                                                      <Select
                                                        value={ts.from}
                                                        onValueChange={(value) => {
                                                          const newShared = [...sharedTimeSlots];
                                                          newShared[index].from = value;
                                                          if (newShared[index].to <= value) {
                                                            newShared[index].to = '';
                                                          }
                                                          setSharedTimeSlots(newShared);
                                                        }}
                                                      >
                                                        <SelectTrigger><SelectValue placeholder="Start" /></SelectTrigger>
                                                        <SelectContent>
                                                            {fromTimeOptions.map(time => (
                                                                <SelectItem key={`from-${time}`} value={time}>{format(parse(time, "HH:mm", new Date()), 'p')}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                      </Select>
                                                   </div>
                                                   <div className="flex-grow space-y-1">
                                                      <Label className="text-xs font-normal">To</Label>
                                                      <Select
                                                        value={ts.to}
                                                        onValueChange={(value) => {
                                                          const newShared = [...sharedTimeSlots];
                                                          newShared[index].to = value;
                                                          setSharedTimeSlots(newShared);
                                                        }}
                                                        disabled={!ts.from}
                                                      >
                                                        <SelectTrigger><SelectValue placeholder="End" /></SelectTrigger>
                                                        <SelectContent>
                                                            {toTimeOptions.map(time => (
                                                                <SelectItem key={`to-${time}`} value={time}>{format(parse(time, "HH:mm", new Date()), 'p')}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                      </Select>
                                                   </div>
                                                   <Button type="button" variant="ghost" size="icon" onClick={() => setSharedTimeSlots(prev => prev.filter((_, i) => i !== index))} disabled={sharedTimeSlots.length <=1}>
                                                        <Trash className="h-4 w-4 text-red-500" />
                                                   </Button>
                                                </div>
                                            )})}
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
                                            {form.watch('availabilitySlots') && form.watch('availabilitySlots').length > 0 ? (
                                                [...form.watch('availabilitySlots')]
                                                .sort((a, b) => daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day))
                                                .map((fieldItem, index) => (
                                                <div key={index} className="text-sm">
                                                        <p className="font-semibold">{fieldItem.day}</p>
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                        {fieldItem.timeSlots.map((ts, i) => {
                                                            if (!ts.from || !ts.to) return null;
                                                            return (
                                                                <Badge key={i} variant="secondary" className="font-normal">
                                                                {format(parse(ts.from, "HH:mm", new Date()), 'p')} - {format(parse(ts.to, "HH:mm", new Date()), 'p')}
                                                                </Badge>
                                                            );
                                                        })}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : <p className="text-xs text-muted-foreground text-center pt-6">No availability applied yet.</p>
                                        }
                                        </div>
                                      </div>


                                      <div className="flex justify-end gap-2 mt-4">
                                        <Button type="button" variant="ghost" onClick={() => setIsEditingAvailability(false)} disabled={isPending}>Cancel</Button>
                                        <Button type="submit" disabled={isPending || !form.formState.isValid}>
                                            {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : 'Save Schedule'}
                                        </Button>
                                      </div>
                                  </form>
                                </Form>
                            ) : (
                                <div className="space-y-4">
                                    {selectedDoctor.availabilitySlots && selectedDoctor.availabilitySlots.length > 0 ? (
                                        selectedDoctor.availabilitySlots
                                        .slice()
                                        .sort((a, b) => daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day))
                                        .map((slot, index) => (
                                            <React.Fragment key={index}>
                                            <div>
                                                <p className="font-semibold text-sm">{slot.day}</p>
                                                <div className="flex flex-wrap gap-2 items-center mt-2">
                                                    {slot.timeSlots.map((ts, i) => {
                                                        if (!ts.from || !ts.to) return null;
                                                        const fromTime = parse(ts.from, 'hh:mm a', new Date());
                                                        const toTime = parse(ts.to, 'hh:mm a', new Date());
                                                        
                                                        return (
                                                            <Badge key={i} variant="outline" className="text-sm group relative pr-7">
                                                                {!isNaN(fromTime.valueOf()) ? format(fromTime, 'p') : ts.from} - {!isNaN(toTime.valueOf()) ? format(toTime, 'p') : ts.to}
                                                                <button 
                                                                    onClick={() => handleDeleteTimeSlot(slot.day, ts)}
                                                                    className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <X className="h-3 w-3 text-red-500" />
                                                                </button>
                                                            </Badge>
                                                        );
                                                    })}
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
                    <ReviewsSection reviews={selectedDoctor.reviewList || []} />
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
        onSave={handleDoctorSaved}
        isOpen={isAddDoctorOpen}
        setIsOpen={setIsAddDoctorOpen}
        doctor={editingDoctor}
        departments={clinicDepartments}
        updateDepartments={(newDepartment) => setClinicDepartments(prev => [...prev, newDepartment])}
      />
      
      <AlertDialog open={showExtensionDialog} onOpenChange={(open) => {
        if (!open) {
            setShowExtensionDialog(false);
            setPendingBreakData(null);
            setExtensionOptions(null);
        }
      }}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Extend Availability Time?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                    {extensionOptions ? (
                        extensionOptions.hasOverrun ? (
                            // Bad scenario: tokens outside availability
                            <div className="space-y-3">
                                <p>Some booked appointments will extend beyond the original availability after applying this break:</p>
                                <ul className="list-disc list-inside space-y-1 text-sm">
                                    <li><strong>Last booked token before break:</strong> {extensionOptions.lastTokenBefore}</li>
                                    <li><strong>Last token after break:</strong> {extensionOptions.lastTokenAfter}</li>
                                    <li><strong>Original availability ends at:</strong> {extensionOptions.originalEnd}</li>
                                    <li><strong>Break taken:</strong> {extensionOptions.breakDuration} minutes</li>
                                </ul>
                                <p className="text-sm font-medium">Choose how to extend availability:</p>
                            </div>
                        ) : (
                            // Safe scenario: all tokens within availability
                            <div className="space-y-2">
                                <p>Last booked token for this day is at {extensionOptions.lastTokenBefore || 'N/A'}. After applying this break, it will still finish within the original availability (ending at {extensionOptions.originalEnd}).</p>
                                <p>Break duration is {extensionOptions.breakDuration} minutes. Do you want to extend the availability to fully compensate the break?</p>
                            </div>
                        )
                    ) : (
                        <p>Do you want to extend the availability time to compensate for the break duration?</p>
                    )}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="mt-4 flex flex-col space-y-2">
                {extensionOptions?.hasOverrun ? (
                    // Bad scenario: 2 buttons (minimal vs full extension)
                    <>
                        <AlertDialogCancel className="w-full justify-start">Cancel</AlertDialogCancel>
                        <AlertDialogAction className="w-full justify-start" onClick={() => {
                            const originalEndDate = parseTimeUtil(extensionOptions.originalEnd, leaveCalDate!);
                            const minimalEndDate = addMinutes(originalEndDate, extensionOptions.minimalExtension);
                            const minimalEndTime = format(minimalEndDate, 'hh:mm a');
                            confirmBreakWithExtension(extensionOptions.minimalExtension);
                        }}>
                            <div className="flex flex-col items-start text-left">
                                <span className="font-semibold flex flex-col items-start text-left">
                                    <span>
                                        Extend to {(() => {
                                            if (!leaveCalDate) return '';
                                            const originalEndDate = parseTimeUtil(extensionOptions.originalEnd, leaveCalDate);
                                            const minimalEndDate = addMinutes(originalEndDate, extensionOptions.minimalExtension);
                                            return format(minimalEndDate, 'hh:mm a');
                                        })()}
                                    </span>
                                    <span>(+{extensionOptions.minimalExtension} min)</span>
                                </span>
                                <span className="text-xs font-normal text-muted-foreground">
                                    finish booked patients
                                </span>
                            </div>
                        </AlertDialogAction>
                        <AlertDialogAction className="w-full justify-start" onClick={() => {
                            confirmBreakWithExtension(extensionOptions.fullExtension);
                        }}>
                            <div className="flex flex-col items-start text-left">
                                <span className="font-semibold flex flex-col items-start text-left">
                                    <span>
                                        Extend to {(() => {
                                            if (!leaveCalDate) return '';
                                            const originalEndDate = parseTimeUtil(extensionOptions.originalEnd, leaveCalDate);
                                            const fullEndDate = addMinutes(originalEndDate, extensionOptions.fullExtension);
                                            return format(fullEndDate, 'hh:mm a');
                                        })()}
                                    </span>
                                    <span>(+{extensionOptions.fullExtension} min)</span>
                                </span>
                                <span className="text-xs font-normal text-muted-foreground">
                                    fully compensate break
                                </span>
                            </div>
                        </AlertDialogAction>
                    </>
                ) : (
                    // Safe scenario: 3 buttons (Cancel, No Keep Same, Yes Extend)
                    <>
                        <AlertDialogCancel className="w-full justify-start">Cancel</AlertDialogCancel>
                        <AlertDialogAction className="w-full justify-start" onClick={() => confirmBreakWithExtension(null)}>No, Keep Same</AlertDialogAction>
                        <AlertDialogAction className="w-full justify-start" onClick={() => {
                            if (extensionOptions) {
                                confirmBreakWithExtension(extensionOptions.fullExtension);
                            } else {
                                confirmBreakWithExtension(null);
                            }
                        }}>Yes, Extend</AlertDialogAction>
                    </>
                )}
            </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
