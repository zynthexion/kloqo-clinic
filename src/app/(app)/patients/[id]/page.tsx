
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Appointment, Patient, Visit } from "@/lib/types";
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
import { useAuth } from "@/firebase";
import { parse } from "date-fns";

export default function PatientHistoryPage() {
  const params = useParams();
  const patientId = params.id as string;
  const auth = useAuth();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId || !auth.currentUser) return;

    const fetchPatientHistory = async () => {
      try {
        setLoading(true);

        const userDocRef = doc(db, "users", auth.currentUser!.uid);
        const userDocSnap = await getDoc(userDocRef);
        const clinicId = userDocSnap.data()?.clinicId;

        if (!clinicId) {
            console.error("Clinic ID not found for user");
            setLoading(false);
            return;
        }
        
        const patientDocRef = doc(db, "clinics", clinicId, "patients", patientId);
        const patientDocSnap = await getDoc(patientDocRef);

        if (patientDocSnap.exists()) {
          const patientData = patientDocSnap.data() as Patient;
          const sortedHistory = patientData.visitHistory?.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          ) || [];
          
          setPatient({ ...patientData, visitHistory: sortedHistory });
        } else {
          console.error("Patient not found");
        }

      } catch (error) {
        console.error("Error fetching patient history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPatientHistory();
  }, [patientId, auth.currentUser]);

  const lastVisit = patient?.visitHistory?.[0];

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
                      <p className="font-medium">{lastVisit ? lastVisit.date : 'N/A'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Visit History</CardTitle>
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
                      {patient.visitHistory && patient.visitHistory.length > 0 ? (
                        patient.visitHistory.map((visit) => (
                          <TableRow key={visit.appointmentId}>
                            <TableCell>{visit.date}</TableCell>
                            <TableCell>{visit.time}</TableCell>
                            <TableCell>{visit.doctor}</TableCell>
                            <TableCell>{visit.department}</TableCell>
                            <TableCell>{visit.treatment}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  visit.status === "Confirmed" || visit.status === "Completed"
                                    ? "success"
                                    : visit.status === "Pending"
                                    ? "warning"
                                    : "destructive"
                                }
                              >
                                {visit.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                         <TableRow>
                            <TableCell colSpan={6} className="text-center h-24">
                                No visit history found for this patient.
                            </TableCell>
                         </TableRow>
                      )}
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
