

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
import { doc, updateDoc, collection, getDocs, setDoc, getDoc, query, where } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Doctor, Appointment, LeaveSlot, Department, TimeSlot } from "@/lib/types";
import { format, parse, isSameDay, getDay, parse as parseDateFns } from "date-fns";
import { Clock, User, BriefcaseMedical, Calendar as CalendarIcon, Info, Edit, Save, X, Trash, Copy, Loader2, ChevronLeft, ChevronRight, Search, Star, Users, CalendarDays, Link as LinkIcon, PlusCircle, DollarSign, Printer, FileDown, ChevronUp, ChevronDown, Minus, Trophy, Repeat, CalendarCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { TimeSlots } from "@/components/doctors/time-slots";
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
import { cn } from "@/lib/utils";
import Link from 'next/link';
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

const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayAbbreviations = ["S", "M", "T", "W", "T", "F", "S"];

const timeSlotSchema = z.object({
  from: z.string().min(1, "Required"),
  to: z.string().min(1, "Required"),
});

const availabilitySlotSchema = z.object({
  day: z.string(),
  timeSlots: z.array(timeSlotSchema).min(1, "At least one time slot is required."),
});

const weeklyAvailabilityFormSchema = z.object({
  availableDays: z.array(z.string()).default([]),
  availabilitySlots: z.array(availabilitySlotSchema).refine(
    (slots) => slots.every((slot) => slot.timeSlots.length > 0),
    {
      message: "Each selected day must have at least one time slot.",
    }
  ),
});
type WeeklyAvailabilityFormValues = z.infer<typeof weeklyAvailabilityFormSchema>;

const addDoctorFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  specialty: z.string().min(2, { message: "Specialty must be at least 2 characters." }),
  department: z.string().min(1, { message: "Please select a department." }),
  registrationNumber: z.string().optional(),
  bio: z.string().min(10, { message: "Bio must be at least 10 characters." }),
  experience: z.coerce.number().min(0, "Years of experience cannot be negative."),
  consultationFee: z.coerce.number().min(0, "Consultation fee cannot be negative."),
  averageConsultingTime: z.coerce.number().min(5, "Must be at least 5 minutes."),
  availabilitySlots: z.array(availabilitySlotSchema).min(1, "At least one availability slot is required."),
  photo: z.any().optional(),
  freeFollowUpDays: z.coerce.number().min(0, "Cannot be negative.").optional(),
  advanceBookingDays: z.coerce.number().min(0, "Cannot be negative.").optional(),
});
type AddDoctorFormValues = z.infer<typeof addDoctorFormSchema>;

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

export default function DoctorsPage() {
  const auth = useAuth();
  const [isPending, startTransition] = useTransition();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState("details");

  const form = useForm<WeeklyAvailabilityFormValues>({
    resolver: zodResolver(weeklyAvailabilityFormSchema),
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
  const [clinicDepartments, setClinicDepartments] = useState<Department[]>([]);
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
  const [newExperience, setNewExperience] = useState<number | string>("");
  const [newRegistrationNumber, setNewRegistrationNumber] = useState("");

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
  }, [auth.currentUser, toast]);
  

  useEffect(() => {
    if (selectedDoctor) {
      const doctorAppointments = appointments.filter(
        (apt) => apt.doctor === selectedDoctor.name
      );

      if (doctorAppointments.length > 0) {
          try {
            const firstAptDate = parse(doctorAppointments[0].date, 'd MMMM yyyy', new Date());
            if (!isNaN(firstAptDate.getTime())) {
              setSelectedDate(firstAptDate);
            }
          } catch(e) {
              // ignore invalid date
          }
      }
      
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

  const handleEditAvailability = () => {
    if (!selectedDoctor) return;

    const availabilitySlotsForForm = selectedDoctor.availabilitySlots?.map(s => {
      return {
        ...s,
        timeSlots: s.timeSlots.map(ts => {
          try {
            // If already in HH:mm, this will work. If in hh:mm a, it will convert.
            const parsedFrom = parseDateFns(ts.from, 'hh:mm a', new Date());
            const parsedTo = parseDateFns(ts.to, 'hh:mm a', new Date());
            
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

    const handleSaveDoctor = async (doctorData: AddDoctorFormValues & { consultationStatus?: 'In' | 'Out' }) => {
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
          .map(slot => `${slot.day}: ${slot.timeSlots.map(ts => `${format(parseDateFns(ts.from, "HH:mm", new Date()), "hh:mm a")}-${format(parseDateFns(ts.to, "HH:mm", new Date()), "hh:mm a")}`).join(', ')}`)
          .join('; ');

        const docId = doctorData.id || `doc-${Date.now()}`;

        const doctorToSave: Partial<Doctor> & {name: string; specialty: string; department: string; avatar: string; bio: string; experience: number; consultationFee: number; averageConsultingTime: number; availabilitySlots: any[]; schedule: string; consultationStatus: 'In' | 'Out'; registrationNumber?: string; } = {
          name: doctorData.name,
          specialty: doctorData.specialty,
          department: doctorData.department,
          registrationNumber: doctorData.registrationNumber,
          avatar: photoUrl!,
          schedule: scheduleString || "Not set",
          preferences: 'Not set',
          historicalData: 'No data',
          availability: doctorData.id ? selectedDoctor?.availability : 'Unavailable',
          consultationStatus: doctorData.consultationStatus || 'Out',
          bio: doctorData.bio,
          experience: doctorData.experience,
          consultationFee: doctorData.consultationFee,
          averageConsultingTime: doctorData.averageConsultingTime,
          availabilitySlots: doctorData.availabilitySlots.map(s => ({...s, timeSlots: s.timeSlots.map(ts => ({
            from: format(parseDateFns(ts.from, "HH:mm", new Date()), "hh:mm a"),
            to: format(parseDateFns(ts.to, "HH:mm", new Date()), "hh:mm a")
          }))})),
          freeFollowUpDays: doctorData.freeFollowUpDays,
          advanceBookingDays: doctorData.advanceBookingDays,
        };
        
        if (doctorData.id) {
          doctorToSave.id = doctorData.id;
        }

        if (auth.currentUser) {
            const userDocSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
            const clinicId = userDocSnap.data()?.clinicId;
            if (clinicId) {
                await setDoc(doc(db, "doctors", docId), {...doctorToSave, clinicId: clinicId}, { merge: true });
                
                const doctorsQuery = query(collection(db, "doctors"), where("clinicId", "==", clinicId));
                const updatedDoctors = await getDocs(doctorsQuery);
                const doctorsList = updatedDoctors.docs.map(doc => ({ id: doc.id, ...doc.data(), clinicId } as Doctor));
                setDoctors(doctorsList);

                if (!doctorData.id) {
                    setSelectedDoctor(doctorsList.find(d => d.id === docId) || null);
                } else {
                    setSelectedDoctor(prev => prev && prev.id === docId ? { ...prev, ...(doctorToSave as Doctor), id: docId, clinicId } : prev);
                }
            }
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

    const handleStatusChange = async (newStatus: 'In' | 'Out') => {
        if (!selectedDoctor) return;

        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, { consultationStatus: newStatus });
                const updatedDoctor = { ...selectedDoctor, consultationStatus: newStatus };
                setSelectedDoctor(updatedDoctor);
                setDoctors(prev => prev.map(d => d.id === selectedDoctor.id ? updatedDoctor : d));
                toast({
                    title: "Status Updated",
                    description: `Dr. ${selectedDoctor.name} is now marked as ${newStatus}.`,
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
                    experience: Number(newExperience),
                    registrationNumber: newRegistrationNumber,
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
    
        const validSlots = values.availabilitySlots
          .map(slot => {
              const filteredTimeSlots = slot.timeSlots.filter(ts => ts.from && ts.to);
              return { ...slot, timeSlots: filteredTimeSlots };
          })
          .filter(slot => slot.timeSlots.length > 0);
    
        const availabilitySlotsToSave = validSlots.map(s => ({
          ...s,
          timeSlots: s.timeSlots.map(ts => ({
            from: format(parseDateFns(ts.from, "HH:mm", new Date()), "hh:mm a"),
            to: format(parseDateFns(ts.to, "HH:mm", new Date()), "hh:mm a")
          }))
        }));

        const scheduleString = availabilitySlotsToSave
          ?.sort((a, b) => daysOfWeek.indexOf(a.day) - daysOfWeek.indexOf(b.day))
          .map(slot => `${slot.day}: ${slot.timeSlots.map(ts => `${ts.from}-${ts.to}`).join(', ')}`)
          .join('; ');
    
        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, {
                    availabilitySlots: availabilitySlotsToSave,
                    schedule: scheduleString,
                });
                const updatedDoctor = { ...selectedDoctor, availabilitySlots: availabilitySlotsToSave, schedule: scheduleString };
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
    
        startTransition(async () => {
            const doctorRef = doc(db, "doctors", selectedDoctor.id);
            try {
                await updateDoc(doctorRef, { availabilitySlots: updatedAvailabilitySlots });
                const updatedDoctor = { ...selectedDoctor, availabilitySlots: updatedAvailabilitySlots };
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
    
        const currentFormSlots = form.getValues('availabilitySlots') || [];
        const newSlotsMap = new Map<string, { day: string; timeSlots: { from: string; to: string }[] }>();
        
        currentFormSlots.forEach(slot => newSlotsMap.set(slot.day, slot));
    
        selectedDays.forEach(day => {
            newSlotsMap.set(day, { day, timeSlots: validSharedTimeSlots });
        });
        
        const updatedSlots = Array.from(newSlotsMap.values());
        form.setValue('availabilitySlots', updatedSlots, { shouldDirty: true });
        
        toast({
            title: "Time Slots Applied",
            description: `The defined time slots have been applied to the selected days.`,
        });
        
        setSelectedDays([]);
    };

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
      const leaveForDay = selectedDoctor.leaveSlots.find(ls => ls.date && isSameDay(parse(ls.date, "yyyy-MM-dd", new Date()), aptDate));
      
      if (!leaveForDay) return false;

      const aptTime = parseDateFns(appointment.time, "hh:mm a", new Date(0));
      
      return leaveForDay.slots.some(leaveSlot => {
          const leaveStart = parseDateFns(leaveSlot.from, "hh:mm a", new Date(0));
          const leaveEnd = parseDateFns(leaveSlot.to, "hh:mm a", new Date(0));
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
                    <Image
                        src={selectedDoctor.avatar}
                        alt={selectedDoctor.name}
                        width={112}
                        height={112}
                        className="rounded-md object-cover"
                        data-ai-hint="doctor portrait"
                    />
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
                            <Button size="sm" variant="ghost" className="text-white hover:bg-white/20" onClick={() => {setIsEditingDetails(false); /* reset logic handled in useEffect */}} disabled={isPending}>Cancel</Button>
                            <Button size="sm" className="bg-white text-primary hover:bg-white/90" onClick={handleDetailsSave} disabled={isPending}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                Save
                            </Button>
                        </div>
                    )}
                    <div className="flex-grow"></div>
                    <div className="flex items-center space-x-2 bg-primary p-2 rounded-md">
                      <Switch
                        id="status-switch"
                        checked={selectedDoctor.consultationStatus === 'In'}
                        onCheckedChange={(checked) => handleStatusChange(checked ? 'In' : 'Out')}
                        disabled={isPending}
                        className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
                      />
                      <Label htmlFor="status-switch" className="font-semibold text-white">
                        {selectedDoctor.consultationStatus === 'In' ? 'In' : 'Out'}
                      </Label>
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
                            <div className="text-2xl font-bold">{selectedDoctor.todaysAppointments || 0}</div>
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
                                            {daysOfWeek.map((day, index) => (
                                                <ToggleGroupItem key={daysOfWeek[index]} value={daysOfWeek[index]} aria-label={`Toggle ${daysOfWeek[index]}`} className="h-9 w-9">
                                                    {dayAbbreviations[index]}
                                                </ToggleGroupItem>
                                            ))}
                                        </ToggleGroup>
                                      </div>

                                      <div className="space-y-2">
                                        <Label>2. Define time slots</Label>
                                        {sharedTimeSlots.map((ts, index) => (
                                            <div key={index} className="flex items-end gap-2">
                                               <div className="flex-grow">
                                                  <Label className="text-xs font-normal">From</Label>
                                                  <Input type="time" value={ts.from} onChange={(e) => {
                                                      const newShared = [...sharedTimeSlots];
                                                      newShared[index].from = e.target.value;
                                                      setSharedTimeSlots(newShared);
                                                  }} />
                                               </div>
                                               <div className="flex-grow">
                                                  <Label className="text-xs font-normal">To</Label>
                                                  <Input type="time" value={ts.to} onChange={(e) => {
                                                      const newShared = [...sharedTimeSlots];
                                                      newShared[index].to = e.target.value;
                                                      setSharedTimeSlots(newShared);
                                                  }} />
                                               </div>
                                               <Button type="button" variant="ghost" size="icon" onClick={() => setSharedTimeSlots(prev => prev.filter((_, i) => i !== index))} disabled={sharedTimeSlots.length <=1}>
                                                    <Trash className="h-4 w-4 text-red-500" />
                                               </Button>
                                            </div>
                                        ))}
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
                                            {fields.map((field, index) => (
                                               <div key={field.id} className="text-sm">
                                                    <p className="font-semibold">{field.day}</p>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                      {field.timeSlots.map((ts, i) => {
                                                          if (!ts.from || !ts.to) return null;
                                                          return (
                                                            <Badge key={i} variant="secondary" className="font-normal">
                                                              {format(parseDateFns(ts.from, "HH:mm", new Date()), 'p')} - {format(parseDateFns(ts.to, "HH:mm", new Date()), 'p')}
                                                            </Badge>
                                                          );
                                                      })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                      </div>


                                      <div className="flex justify-end gap-2 mt-4">
                                        <Button type="button" variant="ghost" onClick={() => setIsEditingAvailability(false)} disabled={isPending}>Cancel</Button>
                                        <Button type="submit" disabled={isPending}>
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
                                                        const fromTime = parseDateFns(ts.from, 'hh:mm a', new Date());
                                                        const toTime = parseDateFns(ts.to, 'hh:mm a', new Date());
                                                        
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
        departments={clinicDepartments}
      />
    </>
  );
}
