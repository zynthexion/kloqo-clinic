
"use client";

import { DoctorsHeader } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
  Search,
  Users,
  CalendarDays,
  Clock,
  User,
  BriefcaseMedical,
  Mail,
  Phone,
  Cake,
} from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import React, { useState, useEffect, useMemo } from "react";
import type { Doctor, Department, Appointment } from "@/lib/types";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';
import { TopNav } from "@/components/layout/top-nav";
import { Calendar } from "@/components/ui/calendar";
import { format, isSameDay, parse, getDay, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DoctorListItem = ({ doctor, onSelect, isSelected }: { doctor: Doctor, onSelect: () => void, isSelected: boolean }) => (
    <div
      className={cn(
        "flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors",
        isSelected ? "bg-primary/10" : "hover:bg-muted/50"
      )}
      onClick={onSelect}
    >
        <Image
            src={doctor.avatar}
            alt={doctor.name}
            width={40}
            height={40}
            className="rounded-full object-cover"
            data-ai-hint="doctor portrait"
        />
        <div className="flex-grow">
            <p className={cn("font-semibold text-sm", isSelected && "text-primary")}>{doctor.name}</p>
            <p className="text-xs text-muted-foreground">{doctor.specialty}</p>
        </div>
        <Badge
            variant={doctor.availability === "Available" ? "success" : "danger"}
            className="h-2 w-2 p-0 rounded-full"
        />
    </div>
);


export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [doctorsPerPage, setDoctorsPerPage] = useState(8);


  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [doctorsSnapshot, departmentsSnapshot, appointmentsSnapshot] = await Promise.all([
          getDocs(collection(db, "doctors")),
          getDocs(collection(db, "departments")),
          getDocs(collection(db, "appointments")),
        ]);

        const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);
        if (doctorsList.length > 0) {
          setSelectedDoctor(doctorsList[0]);
        }

        const departmentsList = departmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
        setDepartments(departmentsList);

        const appointmentsList = appointmentsSnapshot.docs.map(doc => ({ ...doc.data() } as Appointment));
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
  }, [toast]);
  
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

  const doctorAppointments = useMemo(() => {
    if (!selectedDoctor) return [];
    return appointments.filter(apt => apt.doctor === selectedDoctor.name);
  }, [selectedDoctor, appointments]);

  const appointmentsOnSelectedDate = useMemo(() => {
    if (!selectedDate || !doctorAppointments) return [];
    return doctorAppointments.filter(apt => isSameDay(parse(apt.date, 'd MMMM yyyy', new Date()), selectedDate));
  }, [selectedDate, doctorAppointments]);

  const leaveDates = useMemo(() => {
    if (!selectedDoctor?.leaveSlots) return [];
    return selectedDoctor.leaveSlots.map(ls => parse(ls.date, 'yyyy-MM-dd', new Date()));
  }, [selectedDoctor?.leaveSlots]);


  return (
    <>
      <TopNav />
      <main className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-12 gap-6 p-6">
          {/* Left Column: Doctor List */}
          <div className="col-span-12 lg:col-span-3 h-full">
             <Card className="h-full flex flex-col">
                <CardHeader>
                  <CardTitle>Doctors</CardTitle>
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
                          {departments.map(dept => (
                              <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="flex-grow overflow-y-auto pr-2 space-y-1">
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

          {/* Middle Column: Calendar and Appointments */}
          <div className="col-span-12 lg:col-span-5 h-full">
            <Card className="h-full flex flex-col">
                <CardHeader>
                    <CardTitle>Schedule</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow flex flex-col">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        className="rounded-md border"
                        month={selectedDate}
                        onMonthChange={(month) => setSelectedDate(month)}
                        modifiers={{ leave: leaveDates }}
                        modifiersStyles={{ 
                            leave: { color: 'red', textDecoration: 'line-through' },
                        }}
                        components={{
                            DayContent: ({ date }) => {
                                const appointmentsForDay = doctorAppointments.filter(apt => isSameDay(parse(apt.date, 'd MMMM yyyy', new Date()), date)).length;
                                return (
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        <span>{format(date, 'd')}</span>
                                        {appointmentsForDay > 0 && <span className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-primary rounded-full"></span>}
                                    </div>
                                );
                            },
                        }}
                    />
                    <div className="mt-4 flex-grow overflow-hidden">
                       <h3 className="font-semibold text-md mb-2">Appointments on {selectedDate ? format(selectedDate, "MMM d, yyyy") : ''}</h3>
                       <div className="overflow-y-auto h-[calc(100%-2rem)]">
                        {appointmentsOnSelectedDate.length > 0 ? (
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Patient</TableHead>
                                        <TableHead>Time</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {appointmentsOnSelectedDate.map(apt => (
                                        <TableRow key={apt.id}>
                                            <TableCell className="font-medium">{apt.patientName}</TableCell>
                                            <TableCell>{apt.time}</TableCell>
                                            <TableCell>
                                               <Badge
                                                  variant={
                                                    apt.status === "Confirmed" ? "success"
                                                    : apt.status === "Pending" ? "warning"
                                                    : "destructive"
                                                  }
                                                >
                                                  {apt.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-center text-sm text-muted-foreground py-10">No appointments for this day.</div>
                        )}
                       </div>
                    </div>
                </CardContent>
            </Card>
          </div>

          {/* Right Column: Doctor Details */}
          <div className="col-span-12 lg:col-span-4 h-full">
            {selectedDoctor ? (
                <Card className="h-full flex flex-col">
                    <CardContent className="p-6 flex flex-col items-center text-center flex-grow">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-yellow-300 via-primary to-yellow-500 rounded-full blur-xl opacity-30"></div>
                            <Image
                                src={selectedDoctor.avatar}
                                alt={selectedDoctor.name}
                                width={120}
                                height={120}
                                className="rounded-full object-cover relative border-4 border-background"
                                data-ai-hint="doctor portrait"
                            />
                        </div>
                        <h3 className="mt-4 text-xl font-semibold">{selectedDoctor.name}</h3>
                        <p className="text-muted-foreground">{selectedDoctor.specialty}</p>
                        <p className="text-xs text-muted-foreground">{selectedDoctor.department}</p>

                        <div className="w-full text-left mt-6 space-y-4">
                            <h4 className="font-semibold">Basic Information</h4>
                            <div className="space-y-3 text-sm">
                               <div className="flex items-center gap-3">
                                  <Mail className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-muted-foreground">email@domain.com</span>
                               </div>
                               <div className="flex items-center gap-3">
                                  <Phone className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-muted-foreground">+1 234 567 890</span>
                               </div>
                               <div className="flex items-center gap-3">
                                  <Cake className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-muted-foreground">26 September 1988</span>
                               </div>
                            </div>

                            <h4 className="font-semibold pt-4 border-t">Statistics</h4>
                             <div className="space-y-3 text-sm">
                               <div className="flex items-center justify-between gap-3">
                                  <p className="text-muted-foreground">Total Patients</p>
                                  <p className="font-semibold">{selectedDoctor.totalPatients ?? 'N/A'}</p>
                               </div>
                               <div className="flex items-center justify-between gap-3">
                                  <p className="text-muted-foreground">Today's Appointments</p>
                                  <p className="font-semibold">{selectedDoctor.todaysAppointments ?? 'N/A'}</p>
                               </div>
                               <div className="flex items-center justify-between gap-3">
                                  <p className="text-muted-foreground">Avg. Consulting Time</p>
                                  <p className="font-semibold">{selectedDoctor.averageConsultingTime ?? 'N/A'} min</p>
                               </div>
                            </div>
                        </div>

                    </CardContent>
                    <CardFooter>
                         <Button asChild className="w-full">
                           <Link href={`/doctors/${selectedDoctor.id}`}>View Full Profile & Edit</Link>
                         </Button>
                    </CardFooter>
                </Card>
            ) : (
                 <Card className="h-full flex items-center justify-center">
                    <p className="text-muted-foreground">Select a doctor to view details</p>
                 </Card>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
