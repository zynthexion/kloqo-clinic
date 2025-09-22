
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { AppSidebar } from "@/components/layout/sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { DoctorsHeader } from "@/components/layout/header";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Doctor, Appointment } from "@/lib/types";
import { appointments as dummyAppointments } from "@/lib/data";
import { format, parse } from "date-fns";
import { Clock, User, BriefcaseMedical, Calendar as CalendarIcon, Info } from "lucide-react";

export default function DoctorDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      const fetchDoctorData = async () => {
        setLoading(true);
        const doctorRef = doc(db, "doctors", id);
        const doctorSnap = await getDoc(doctorRef);

        if (doctorSnap.exists()) {
          const doctorData = { id: doctorSnap.id, ...doctorSnap.data() } as Doctor;
          setDoctor(doctorData);

          // Use dummy appointments and filter by doctor name
          const doctorAppointments = dummyAppointments.filter(
            (apt) => apt.doctor === doctorData.name
          );
          setAppointments(doctorAppointments);

          if (doctorAppointments.length > 0) {
              const firstAptDate = parse(doctorAppointments[0].date, 'd MMMM yyyy', new Date());
              setSelectedDate(firstAptDate);
          } else {
             setSelectedDate(new Date());
          }

        } else {
          console.log("No such document!");
        }
        setLoading(false);
      };

      fetchDoctorData();
    }
  }, [id]);

  useEffect(() => {
    if (appointments.length > 0 && !selectedDate) {
        const firstAptDate = parse(appointments[0].date, 'd MMMM yyyy', new Date());
        if (!isNaN(firstAptDate.getTime())) {
            setSelectedDate(firstAptDate);
        } else {
            setSelectedDate(new Date());
        }
    }
  }, [appointments, selectedDate]);


  const filteredAppointments = useMemo(() => {
    if (!selectedDate) return [];

    const selectedDay = format(selectedDate, "yyyy-MM-dd");

    return appointments.filter((appointment) => {
        try {
            const parsedDate = parse(appointment.date, 'd MMMM yyyy', new Date());
            if (isNaN(parsedDate.getTime())) return false;
            const appointmentDay = format(parsedDate, "yyyy-MM-dd");
            return appointmentDay === selectedDay;
        } catch (e) {
            console.error("Error parsing date:", e);
            return false;
        }
    });
  }, [appointments, selectedDate]);
  
  if (loading) {
    return (
        <div className="flex">
            <AppSidebar />
            <SidebarInset>
                <DoctorsHeader />
                <div className="flex items-center justify-center h-full">Loading...</div>
            </SidebarInset>
        </div>
    );
  }

  if (!doctor) {
    return (
        <div className="flex">
            <AppSidebar />
            <SidebarInset>
                <DoctorsHeader />
                <div className="flex items-center justify-center h-full">Doctor not found.</div>
            </SidebarInset>
        </div>
    );
  }

  return (
    <div className="flex">
      <AppSidebar />
      <SidebarInset>
        <DoctorsHeader />
        <main className="flex-1 p-6 bg-background">
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start gap-6">
                <Image
                  src={doctor.avatar}
                  alt={doctor.name}
                  width={128}
                  height={128}
                  className="rounded-full border-4 border-primary/20 object-cover"
                />
                <div className="flex-grow">
                  <h1 className="text-3xl font-bold">{doctor.name}</h1>
                  <p className="text-lg text-muted-foreground">{doctor.specialty}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{doctor.department}</p>
                  <Badge className="mt-4" variant={doctor.availability === "Available" ? "success" : "danger"}>
                    {doctor.availability}
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </Card>
          
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Doctor Details</TabsTrigger>
              <TabsTrigger value="appointments">Appointments</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Info className="w-5 h-5" /> Bio</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">{doctor.bio || "No biography available."}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><CalendarIcon className="w-5 h-5" /> Weekly Availability</CardTitle>
                        </CardHeader>
                        <CardContent>
                           <div className="space-y-3">
                                {doctor.availabilitySlots && doctor.availabilitySlots.length > 0 ? (
                                    doctor.availabilitySlots.map((slot, index) => (
                                        <div key={index} className="flex items-start">
                                            <p className="w-24 font-semibold">{slot.day}</p>
                                            <div className="flex flex-wrap gap-2">
                                                {slot.timeSlots.map((ts, i) => (
                                                    <Badge key={i} variant="outline" className="text-sm">{ts.from} - {ts.to}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground">No availability slots defined.</p>
                                )}
                           </div>
                        </CardContent>
                    </Card>
                </div>
                <div className="space-y-6">
                     <Card>
                        <CardHeader>
                            <CardTitle>Quick Info</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex items-center gap-3">
                                <Clock className="w-5 h-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Avg. Consulting Time</p>
                                    <p className="font-semibold">{doctor.averageConsultingTime || "N/A"} minutes</p>
                                </div>
                            </div>
                             <div className="flex items-center gap-3">
                                <User className="w-5 h-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Patients</p>
                                    <p className="font-semibold">{doctor.totalPatients ?? "0"}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <BriefcaseMedical className="w-5 h-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm text-muted-foreground">Today's Appointments</p>
                                    <p className="font-semibold">{doctor.todaysAppointments ?? "0"}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="appointments" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div>
                        <Card>
                            <CardContent className="p-2">
                                <Calendar
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={setSelectedDate}
                                    className="w-full"
                                    defaultMonth={selectedDate}
                                />
                            </CardContent>
                        </Card>
                    </div>
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Appointments for {selectedDate ? format(selectedDate, "MMMM d, yyyy") : 'all time'}</CardTitle>
                                <CardDescription>A list of scheduled appointments for the selected date.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Patient</TableHead>
                                            <TableHead>Time</TableHead>
                                            <TableHead>Treatment</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredAppointments.length > 0 ? (
                                            filteredAppointments.map(apt => (
                                                <TableRow key={apt.id}>
                                                    <TableCell className="font-medium">{apt.patientName}</TableCell>
                                                    <TableCell>{apt.time}</TableCell>
                                                    <TableCell>{apt.treatment}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={
                                                            apt.status === "Confirmed" ? "success" : 
                                                            apt.status === "Pending" ? "warning" : "outline"
                                                        }>
                                                            {apt.status}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center h-24">No appointments for this day.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </TabsContent>
          </Tabs>
        </main>
      </SidebarInset>
    </div>
  );
}

    