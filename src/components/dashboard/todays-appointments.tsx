
"use client";

import { useEffect, useState } from "react";
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
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Appointment } from "@/lib/types";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "../ui/skeleton";

export default function TodaysAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const todayStr = format(new Date(), "d MMMM yyyy");
        const q = query(
          collection(db, "appointments"),
          where("date", "==", todayStr)
        );
        const querySnapshot = await getDocs(q);
        const appts = querySnapshot.docs.map(
          (doc) => doc.data() as Appointment
        );
        
        const sortedAppts = appts.sort((a, b) => {
            const timeA = new Date(`1970/01/01 ${a.time}`).getTime();
            const timeB = new Date(`1970/01/01 ${b.time}`).getTime();
            return timeA - timeB;
        });

        setAppointments(sortedAppts);
      } catch (error) {
        console.error("Error fetching today's appointments:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAppointments();
  }, []);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Today's Appointments</CardTitle>
        <CardDescription>A list of appointments scheduled for today.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : appointments.length > 0 ? (
                appointments.map((apt) => (
                  <TableRow key={apt.id}>
                    <TableCell className="font-medium">{apt.patientName}</TableCell>
                    <TableCell>{apt.time}</TableCell>
                    <TableCell>{apt.doctor}</TableCell>
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
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No appointments scheduled for today.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
