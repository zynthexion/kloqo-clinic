
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Appointment, Patient } from "@/lib/types";
import { DashboardHeader } from "@/components/layout/header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PatientHistoryPage() {
  const params = useParams();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;

    const fetchPatientHistory = async () => {
      try {
        setLoading(true);
        const [name, phone] = decodeURIComponent(patientId).split("-");

        if (!name || !phone) {
          console.error("Invalid patient ID format");
          return;
        }

        const appointmentsRef = collection(db, "appointments");
        const q = query(
          appointmentsRef,
          where("patientName", "==", name),
          where("phone", "==", phone)
        );

        const querySnapshot = await getDocs(q);
        const patientAppointments = querySnapshot.docs.map(
          (doc) => doc.data() as Appointment
        );

        if (patientAppointments.length > 0) {
          const firstAppointment = patientAppointments[0];
          setPatient({
            id: patientId,
            name: firstAppointment.patientName,
            age: firstAppointment.age,
            gender: firstAppointment.gender,
            phone: firstAppointment.phone,
            place: firstAppointment.place,
            lastVisit: "", // This will be calculated
            doctor: "", // This will be the latest one
            totalAppointments: patientAppointments.length,
          });

          const sortedAppointments = patientAppointments.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );

          setAppointments(sortedAppointments);

          if (sortedAppointments.length > 0) {
            setPatient(p => p ? ({
                ...p,
                lastVisit: sortedAppointments[0].date,
                doctor: sortedAppointments[0].doctor
            }) : null)
          }

        }
      } catch (error) {
        console.error("Error fetching patient history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPatientHistory();
  }, [patientId]);

  return (
    <>
      <div>
        <DashboardHeader />
        <main className="flex-1 p-6 bg-background">
          <div className="flex items-center gap-4 mb-6">
              <Button asChild variant="outline" size="icon">
                  <Link href="/patients"><ArrowLeft className="h-4 w-4" /></Link>
              </Button>
              <h1 className="text-2xl font-bold">Patient History</h1>
          </div>

          {loading ? (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
          ) : patient ? (
            <>
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>{patient.name}</CardTitle>
                  <CardDescription>
                    {patient.gender}, {patient.age} years old
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{patient.phone}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Place</p>
                      <p className="font-medium">{patient.place}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Total Appointments
                      </p>
                      <p className="font-medium">{patient.totalAppointments}</p>
                    </div>
                     <div>
                      <p className="text-sm text-muted-foreground">Last Visit</p>
                      <p className="font-medium">{patient.lastVisit}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Appointment History</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Doctor</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Treatment</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appointments.map((apt) => (
                        <TableRow key={apt.id}>
                          <TableCell>{apt.date}</TableCell>
                          <TableCell>{apt.time}</TableCell>
                          <TableCell>{apt.doctor}</TableCell>
                          <TableCell>{apt.department}</TableCell>
                          <TableCell>{apt.treatment}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                apt.status === "Confirmed"
                                  ? "success"
                                  : apt.status === "Pending"
                                  ? "warning"
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
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
                <CardContent className="p-10 text-center">
                    <p>Patient not found.</p>
                </CardContent>
            </Card>
          )}
        </main>
      </div>
    </>
  );
}
