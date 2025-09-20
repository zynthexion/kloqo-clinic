
"use client";

import { SidebarInset } from "@/components/ui/sidebar";
import { DoctorsHeader } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  MoreHorizontal,
  Search,
  Trash,
  Users,
  CalendarDays
} from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { AddDoctorForm } from "@/components/doctors/add-doctor-form";
import React, { useState, useEffect } from "react";
import type { Doctor } from "@/lib/types";
import { collection, getDocs, addDoc, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";

const DoctorCard = ({ doctor, onEdit, onDelete }: { doctor: Doctor, onEdit: (doctor: Doctor) => void, onDelete: (doctor: Doctor) => void }) => (
    <Card>
        <CardHeader className="flex-row items-start justify-between">
            <div className="flex items-center gap-4">
                <Image
                    src={doctor.avatar}
                    alt={doctor.name}
                    width={48}
                    height={48}
                    className="rounded-full object-cover"
                    data-ai-hint="doctor portrait"
                />
                <div>
                    <CardTitle className="text-lg">{doctor.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                </div>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onEdit(doctor)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onDelete(doctor)} className="text-red-600">
                        <Trash className="mr-2 h-4 w-4" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-4">
             <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Department</p>
                <p className="text-sm">{doctor.department}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Total Patients</p>
                    <p className="text-sm">{doctor.totalPatients}</p>
                </div>
                <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Today</p>
                    <p className="text-sm">{doctor.todaysAppointments}</p>
                </div>
            </div>
        </CardContent>
        <CardFooter>
            <Badge
                variant={
                    doctor.availability === "Available"
                        ? "success"
                        : "danger"
                }
                className="w-full justify-center"
            >
                {doctor.availability}
            </Badge>
        </CardFooter>
    </Card>
);


export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const { toast } = useToast();
  const [isAddDoctorOpen, setIsAddDoctorOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [deletingDoctor, setDeletingDoctor] = useState<Doctor | null>(null);

  useEffect(() => {
    const fetchDoctors = async () => {
      const doctorsCollection = collection(db, "doctors");
      const doctorsSnapshot = await getDocs(doctorsCollection);
      const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
      setDoctors(doctorsList);
    };

    fetchDoctors();
  }, []);

  const handleSaveDoctor = async (doctorData: Omit<Doctor, 'id' | 'avatar' | 'schedule' | 'preferences' | 'historicalData'> & { photo?: File; id?: string }) => {
    try {
      let photoUrl = doctorData.id ? doctors.find(d => d.id === doctorData.id)?.avatar : `https://picsum.photos/seed/${new Date().getTime()}/100/100`;

      if (doctorData.photo) {
        const storageRef = ref(storage, `doctor_photos/${doctorData.photo.name}`);
        const snapshot = await uploadBytes(storageRef, doctorData.photo);
        photoUrl = await getDownloadURL(snapshot.ref);
      }
      
      const scheduleString = doctorData.availabilitySlots
        .map(slot => `${slot.day}: ${slot.timeSlots.map(ts => `${ts.from}-${ts.to}`).join(', ')}`)
        .join('; ');
      
      const dataToSave: any = { ...doctorData };
      delete dataToSave.photo;

      if (doctorData.id) { // Editing existing doctor
        const doctorRef = doc(db, "doctors", doctorData.id);
        const updatedDoctorData = {
          ...dataToSave,
          avatar: photoUrl,
          schedule: scheduleString,
        };
        await updateDoc(doctorRef, updatedDoctorData);
        setDoctors(prev => prev.map(d => d.id === doctorData.id ? { ...d, ...updatedDoctorData } : d));
        toast({
          title: "Doctor Updated",
          description: `${doctorData.name} has been successfully updated.`,
        });
      } else { // Adding new doctor
        const newDoctorRef = doc(collection(db, "doctors"));
        const newDoctorData = {
            ...dataToSave,
            id: newDoctorRef.id,
            avatar: photoUrl,
            schedule: scheduleString,
            preferences: 'Not set',
            historicalData: 'No data',
        };
        await setDoc(newDoctorRef, newDoctorData);
        setDoctors(prev => [...prev, newDoctorData as Doctor]);
        toast({
          title: "Doctor Added",
          description: `${newDoctorData.name} has been successfully added.`,
        });
      }
    } catch (error) {
      console.error("Error saving doctor: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save doctor. Please try again.",
      });
    } finally {
        setIsAddDoctorOpen(false);
        setEditingDoctor(null);
    }
  };
  
  const handleDeleteDoctor = async () => {
    if (!deletingDoctor) return;
    try {
      await deleteDoc(doc(db, "doctors", deletingDoctor.id));
      setDoctors(prev => prev.filter(d => d.id !== deletingDoctor.id));
      toast({
        title: "Doctor Deleted",
        description: `${deletingDoctor.name} has been removed.`,
      });
    } catch (error) {
      console.error("Error deleting doctor:", error);
       toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete doctor. Please try again.",
      });
    } finally {
        setDeletingDoctor(null);
    }
  }

  return (
    <SidebarInset>
      <DoctorsHeader />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
            <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                type="search"
                placeholder="Search name, ID, age, etc"
                className="w-full rounded-lg bg-background pl-8"
                />
            </div>
            <Select>
                <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="general-medicine">
                    General Medicine
                </SelectItem>
                <SelectItem value="cardiology">Cardiology</SelectItem>
                <SelectItem value="pediatrics">Pediatrics</SelectItem>
                <SelectItem value="dermatology">Dermatology</SelectItem>
                </SelectContent>
            </Select>
            <Select>
                <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Specialist" />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="routine-check-ups">
                    Routine Check-Ups
                </SelectItem>
                <SelectItem value="heart-specialist">
                    Heart Specialist
                </SelectItem>
                <SelectItem value="child-health">Child Health</SelectItem>
                <SelectItem value="skin-specialist">
                    Skin Specialist
                </SelectItem>
                </SelectContent>
            </Select>
            <Select>
                <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
            </Select>
            <AddDoctorForm 
                onSave={handleSaveDoctor}
                isOpen={isAddDoctorOpen || !!editingDoctor}
                setIsOpen={(open) => {
                    if (!open) {
                        setIsAddDoctorOpen(false);
                        setEditingDoctor(null);
                    } else {
                        setIsAddDoctorOpen(true);
                    }
                }}
                doctor={editingDoctor}
            />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {doctors.map((doctor) => (
                    <DoctorCard 
                        key={doctor.id} 
                        doctor={doctor} 
                        onEdit={() => setEditingDoctor(doctor)}
                        onDelete={() => setDeletingDoctor(doctor)}
                    />
                ))}
            </div>

            <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Showing</span>
                <Select defaultValue="12">
                <SelectTrigger className="w-[70px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="12">12</SelectItem>
                    <SelectItem value="24">24</SelectItem>
                    <SelectItem value="48">48</SelectItem>
                </SelectContent>
                </Select>
                <span>out of {doctors.length}</span>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon">
                <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="bg-primary/10 text-primary">1</Button>
                <Button variant="outline" size="icon">2</Button>
                <Button variant="outline" size="icon">3</Button>
                <Button variant="outline" size="icon">4</Button>
                <Button variant="outline" size="icon">5</Button>
                <Button variant="outline" size="icon">
                <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
            </div>
        </div>
      </main>
        <AlertDialog open={!!deletingDoctor} onOpenChange={(open) => !open && setDeletingDoctor(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete Dr. {deletingDoctor?.name} and remove their data from our servers.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteDoctor} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </SidebarInset>
  );
}

    

    
