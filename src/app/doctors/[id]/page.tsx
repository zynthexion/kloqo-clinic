
"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
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
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Doctor, Appointment } from "@/lib/types";
import { appointments as dummyAppointments } from "@/lib/data";
import { format, parse, isSameDay } from "date-fns";
import { Clock, User, BriefcaseMedical, Calendar as CalendarIcon, Info, Edit, Save, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

export default function DoctorDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const [isEditingTime, setIsEditingTime] = useState(false);
  const [newAvgTime, setNewAvgTime] = useState<number | string>("");

  const [leaveDates, setLeaveDates] = useState<Date[]>([]);


  useEffect(() => {
    if (id) {
      const fetchDoctorData = async () => {
        setLoading(true);
        const doctorRef = doc(db, "doctors", id);
        const doctorSnap = await getDoc(doctorRef);

        if (doctorSnap.exists()) {
          const doctorData = { id: doctorSnap.id, ...doctorSnap.data() } as Doctor;
          setDoctor(doctorData);
          setNewAvgTime(doctorData.averageConsultingTime || "");
          setLeaveDates((doctorData.leaveDates || []).map(d => new Date(d)));

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

    const handleStatusChange = async (newStatus: 'Available' | 'Unavailable') => {
        if (!doctor) return;

        startTransition(async () => {
            const doctorRef = doc(db, "doctors", doctor.id);
            try {
                await updateDoc(doctorRef, { availability: newStatus });
                setDoctor(prev => prev ? { ...prev, availability: newStatus } : null);
                toast({
                    title: "Status Updated",
                    description: `Dr. ${doctor.name} is now marked as ${newStatus === 'Available' ? 'In' : 'Out'}.`,
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
        if (!doctor || newAvgTime === "") return;
        const timeValue = Number(newAvgTime);
        if (isNaN(timeValue) || timeValue <= 0) {
             toast({ variant: "destructive", title: "Invalid Time", description: "Please enter a valid number." });
             return;
        }

        startTransition(async () => {
            const doctorRef = doc(db, "doctors", doctor.id);
            try {
                await updateDoc(doctorRef, { averageConsultingTime: timeValue });
                setDoctor(prev => prev ? { ...prev, averageConsultingTime: timeValue } : null);
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

    const handleLeaveUpdate = async (dates?: Date[]) => {
      if (!doctor || !dates) return;

      const newLeaveDates = dates.map(d => d.toISOString().split('T')[0]);

      startTransition(async () => {
          const doctorRef = doc(db, "doctors", doctor.id);
          try {
              await updateDoc(doctorRef, { leaveDates: newLeaveDates });
              setLeaveDates(dates);
              toast({
                  title: "Leave Dates Updated",
                  description: "Doctor's leave schedule has been successfully updated.",
              });
          } catch (error) {
              console.error("Error updating leave dates:", error);
              toast({
                  variant: "destructive",
                  title: "Update Failed",
                  description: "Could not update leave dates.",
              });
          }
      });
  };


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

  const isDoctorOnLeave = selectedDate ? leaveDates.some(d => isSameDay(d, selectedDate)) : false;

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
                   <div className="flex items-center space-x-2 mt-4">
                      <Switch
                        id="status-switch"
                        checked={doctor.availability === 'Available'}
                        onCheckedChange={(checked) => handleStatusChange(checked ? 'Available' : 'Unavailable')}
                        disabled={isPending}
                      />
                      <Label htmlFor="status-switch" className={`font-semibold ${doctor.availability === 'Available' ? 'text-green-600' : 'text-red-600'}`}>
                        {doctor.availability === 'Available' ? 'In' : 'Out'}
                      </Label>
                   </div>
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
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><CalendarIcon className="w-5 h-5" /> Mark Leave</CardTitle>
                             <CardDescription>Select dates the doctor will be unavailable. Bookings will be disabled on these days.</CardDescription>
                        </CardHeader>
                        <CardContent>
                           <Calendar
                                mode="multiple"
                                selected={leaveDates}
                                onSelect={(dates) => handleLeaveUpdate(dates)}
                                className="rounded-md border w-full"
                            />
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
                                     {isEditingTime ? (
                                        <div className="flex items-center gap-2 mt-1">
                                            <Input 
                                                type="number" 
                                                value={newAvgTime} 
                                                onChange={(e) => setNewAvgTime(e.target.value)} 
                                                className="w-20 h-8"
                                                disabled={isPending}
                                            />
                                            <Button size="icon" className="h-8 w-8" onClick={handleTimeSave} disabled={isPending}><Save className="h-4 w-4"/></Button>
                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {setIsEditingTime(false); setNewAvgTime(doctor.averageConsultingTime || "")}} disabled={isPending}><X className="h-4 w-4"/></Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold">{doctor.averageConsultingTime || "N/A"} minutes</p>
                                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setIsEditingTime(true)}><Edit className="h-3 w-3"/></Button>
                                        </div>
                                    )}
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
                                    disabled={isDoctorOnLeave}
                                    modifiers={{ leave: leaveDates }}
                                    modifiersStyles={{ leave: { color: 'red', textDecoration: 'line-through' } }}
                                />
                            </CardContent>
                        </Card>
                    </div>
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Appointments for {selectedDate ? format(selectedDate, "MMMM d, yyyy") : 'all time'}</CardTitle>
                                <CardDescription>
                                     {isDoctorOnLeave 
                                        ? "The doctor is on leave on this day."
                                        : "A list of scheduled appointments for the selected date."}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Patient</TableHead>
                                            <TableHead>Age</TableHead>
                                            <TableHead>Gender</TableHead>
                                            <TableHead>Booked Via</TableHead>
                                            <TableHead>Token Number</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredAppointments.length > 0 && !isDoctorOnLeave ? (
                                            filteredAppointments.map((apt, index) => (
                                                <TableRow key={apt.id}>
                                                    <TableCell className="font-medium">{apt.patientName}</TableCell>
                                                    <TableCell>{apt.age}</TableCell>
                                                    <TableCell>{apt.gender}</TableCell>
                                                    <TableCell>{['App', 'Phone', 'Walk In'][index % 3]}</TableCell>
                                                    <TableCell>TKN{String(index + 1).padStart(3, '0')}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center h-24">
                                                    {isDoctorOnLeave ? "Doctor on leave." : "No appointments for this day."}
                                                </TableCell>
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

    