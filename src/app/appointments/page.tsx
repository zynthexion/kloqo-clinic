
"use client";

import { useEffect, useState } from "react";
import { AppointmentsHeader } from "@/components/layout/header";
import { SidebarInset } from "@/components/ui/sidebar";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Appointment, Doctor } from "@/lib/types";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppSidebar } from "@/components/layout/sidebar";
import { collection, getDocs, addDoc, setDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import { AddAppointmentForm } from "@/components/appointments/add-appointment-form";
import { useToast } from "@/hooks/use-toast";


export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabCounts, setTabCounts] = useState({ all: 0, confirmed: 0, pending: 0, cancelled: 0 });
  const [isAddAppointmentOpen, setIsAddAppointmentOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const appointmentsCollection = collection(db, "appointments");
        const appointmentsSnapshot = await getDocs(appointmentsCollection);
        const appointmentsList = appointmentsSnapshot.docs.map(doc => ({ ...doc.data() } as Appointment));
        setAppointments(appointmentsList);

        const counts = appointmentsList.reduce((acc, apt) => {
          acc.all++;
          if (apt.status === "Confirmed") acc.confirmed++;
          else if (apt.status === "Pending") acc.pending++;
          else if (apt.status === "Cancelled") acc.cancelled++;
          return acc;
        }, { all: 0, confirmed: 0, pending: 0, cancelled: 0 });
        setTabCounts(counts);

      } catch (error) {
        console.error("Error fetching appointments:", error);
      } finally {
        setLoading(false);
      }
    };
    
    const fetchDoctors = async () => {
      const doctorsCollection = collection(db, "doctors");
      const doctorsSnapshot = await getDocs(doctorsCollection);
      const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
      setDoctors(doctorsList);
    };

    fetchAppointments();
    fetchDoctors();
  }, []);

  const handleSaveAppointment = async (appointmentData: Omit<Appointment, 'id' | 'tokenNumber' | 'date'> & { date: string }) => {
     try {
        const newAppointmentRef = doc(collection(db, "appointments"));
        const tokenNumber = `TKN${String(appointments.length + 1).padStart(3, '0')}`;
        
        const doctorName = doctors.find(d => d.id === appointmentData.doctor)?.name || "Unknown Doctor";

        const newAppointmentData: Appointment = {
            ...appointmentData,
            id: newAppointmentRef.id,
            tokenNumber: tokenNumber,
            doctor: doctorName,
        };
        await setDoc(newAppointmentRef, newAppointmentData);

        setAppointments(prev => {
          const newAppointments = [...prev, newAppointmentData];
          const counts = newAppointments.reduce((acc, apt) => {
            acc.all++;
            if (apt.status === "Confirmed") acc.confirmed++;
            else if (apt.status === "Pending") acc.pending++;
            else if (apt.status === "Cancelled") acc.cancelled++;
            return acc;
          }, { all: 0, confirmed: 0, pending: 0, cancelled: 0 });
          setTabCounts(counts);
          return newAppointments;
        });

        toast({
            title: "Appointment Booked",
            description: `Appointment for ${newAppointmentData.patientName} has been successfully booked.`,
        });
     } catch (error) {
        console.error("Error saving appointment: ", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to book appointment. Please try again.",
        });
     } finally {
        setIsAddAppointmentOpen(false);
     }
  }

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <AppointmentsHeader onAddAppointment={() => setIsAddAppointmentOpen(true)} />
        <main className="flex-1 p-4 sm:p-6">
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
              <TabsTrigger value="confirmed">Confirmed ({tabCounts.confirmed})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({tabCounts.pending})</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled ({tabCounts.cancelled})</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox />
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Name <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                           <TableHead>
                            <Button variant="ghost" size="sm">
                              Token <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Date <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Time <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Doctor <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Booked Via <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Status <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          Array.from({ length: 10 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            </TableRow>
                          ))
                        ) : (
                          appointments.map((appointment) => (
                            <TableRow key={appointment.id}>
                              <TableCell>
                                <Checkbox />
                              </TableCell>
                              <TableCell className="font-medium">
                                {appointment.patientName}
                              </TableCell>
                              <TableCell>{appointment.tokenNumber}</TableCell>
                              <TableCell>{appointment.date}</TableCell>
                              <TableCell>{appointment.time}</TableCell>
                              <TableCell>{appointment.doctor}</TableCell>
                              <TableCell>{appointment.bookedVia}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    appointment.status === "Confirmed"
                                      ? "success"
                                      : appointment.status === "Pending"
                                      ? "warning"
                                      : "destructive"
                                  }
                                >
                                  {appointment.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button variant="link" className="p-0 h-auto text-primary">
                                    Reschedule
                                  </Button>
                                  <Button variant="link" className="p-0 h-auto text-muted-foreground">
                                    Cancel
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Showing{" "}
              <Select defaultValue="13">
                <SelectTrigger className="inline-flex w-auto h-auto p-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="13">13</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>{" "}
              out of {appointments.length}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="bg-primary/10 text-primary">
                1
              </Button>
              <Button variant="outline" size="icon">
                2
              </Button>
              <Button variant="outline" size="icon">
                3
              </Button>
              <span className="text-muted-foreground">...</span>
              <Button variant="outline" size="icon">
                10
              </Button>
              <Button variant="outline" size="icon">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </main>
      </SidebarInset>
       <AddAppointmentForm
        isOpen={isAddAppointmentOpen}
        setIsOpen={setIsAddAppointmentOpen}
        onSave={handleSaveAppointment}
        doctors={doctors}
      />
    </>
  );
}
