
"use client";

import { SidebarInset } from "@/components/ui/sidebar";
import { DoctorsHeader } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  MoreHorizontal,
  Search,
  Trash,
} from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { AddDoctorForm } from "@/components/doctors/add-doctor-form";
import React, { useState, useEffect } from "react";
import type { Doctor, AvailabilitySlot } from "@/lib/types";
import { collection, getDocs, addDoc, doc, setDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchDoctors = async () => {
      const doctorsCollection = collection(db, "doctors");
      const doctorsSnapshot = await getDocs(doctorsCollection);
      const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
      setDoctors(doctorsList);
    };

    fetchDoctors();
  }, []);

  const handleAddDoctor = async (doctorData: Omit<Doctor, 'id' | 'avatar' | 'schedule' | 'preferences' | 'historicalData' | 'totalPatients' | 'todaysAppointments'> & { maxPatientsPerDay: number; availabilitySlots: AvailabilitySlot[]; photo?: File }) => {
    try {
      let photoUrl = `https://picsum.photos/seed/${new Date().getTime()}/100/100`;

      if (doctorData.photo) {
        const storageRef = ref(storage, `doctor_photos/${doctorData.photo.name}`);
        const snapshot = await uploadBytes(storageRef, doctorData.photo);
        photoUrl = await getDownloadURL(snapshot.ref);
      }
      
      const newDoctorRef = doc(collection(db, "doctors"));
      const scheduleString = doctorData.availabilitySlots
        .map(slot => `${slot.day}: ${slot.timeSlots.map(ts => `${ts.from}-${ts.to}`).join(', ')}`)
        .join('; ');

      const newDoctor: Doctor = {
        id: newDoctorRef.id,
        avatar: photoUrl,
        schedule: scheduleString,
        preferences: 'Not set',
        historicalData: 'No data',
        totalPatients: 0,
        todaysAppointments: 0,
        name: doctorData.name,
        specialty: doctorData.specialty,
        department: doctorData.department,
        availability: doctorData.availability,
        maxPatientsPerDay: doctorData.maxPatientsPerDay,
        availabilitySlots: doctorData.availabilitySlots,
      };

      await setDoc(newDoctorRef, newDoctor);

      setDoctors(prev => [...prev, newDoctor]);

      toast({
        title: "Doctor Added",
        description: `${newDoctor.name} has been successfully added.`,
      });

    } catch (error) {
      console.error("Error adding doctor: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add doctor. Please try again.",
      });
    }
  };

  return (
    <SidebarInset>
      <DoctorsHeader />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <Card>
          <CardContent className="p-4">
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
                <AddDoctorForm onAddDoctor={handleAddDoctor} />
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Specialist</TableHead>
                      <TableHead>Total Patients</TableHead>
                      <TableHead>Today's Appointment</TableHead>
                      <TableHead>Availability Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doctors.map((doctor) => (
                      <TableRow key={doctor.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Image
                              src={doctor.avatar}
                              alt={doctor.name}
                              width={40}
                              height={40}
                              className="rounded-full"
                              data-ai-hint="doctor portrait"
                            />
                            <span className="font-medium">{doctor.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{doctor.id}</TableCell>
                        <TableCell>{doctor.department}</TableCell>
                        <TableCell>{doctor.specialty}</TableCell>
                        <TableCell>{doctor.totalPatients}</TableCell>
                        <TableCell>{doctor.todaysAppointments}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              doctor.availability === "Available"
                                ? "success"
                                : "danger"
                            }
                          >
                            {doctor.availability}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="h-8 w-8 p-0"
                              >
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Trash className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
          </CardContent>
        </Card>
      </main>
    </SidebarInset>
  );
}
