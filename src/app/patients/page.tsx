
"use client";

import { useEffect, useState, useMemo } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/sidebar";
import { DashboardHeader } from "@/components/layout/header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Appointment, Patient } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parse } from 'date-fns';
import Link from "next/link";

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [patientsPerPage, setPatientsPerPage] = useState(10);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const appointmentsCollection = collection(db, "appointments");
        const appointmentsSnapshot = await getDocs(appointmentsCollection);
        const appointmentsList = appointmentsSnapshot.docs.map(
          (doc) => ({ ...doc.data() } as Appointment)
        );

        const patientMap = new Map<string, Patient>();

        appointmentsList.forEach((apt) => {
          const patientId = encodeURIComponent(`${apt.patientName}-${apt.phone}`);
          const appointmentDate = parse(apt.date, 'd MMMM yyyy', new Date());

          if (patientMap.has(patientId)) {
            const existingPatient = patientMap.get(patientId)!;
            
            let lastVisitDate = existingPatient.lastVisit;
            try {
                const existingDate = parse(existingPatient.lastVisit, 'd MMMM yyyy', new Date());
                if (appointmentDate > existingDate) {
                    lastVisitDate = apt.date;
                }
            } catch (e) {
                // Ignore if existing date is invalid
            }

            patientMap.set(patientId, {
              ...existingPatient,
              lastVisit: lastVisitDate,
              totalAppointments: existingPatient.totalAppointments + 1,
            });

          } else {
            patientMap.set(patientId, {
              id: patientId,
              name: apt.patientName,
              age: apt.age,
              gender: apt.gender,
              phone: apt.phone,
              place: apt.place,
              lastVisit: apt.date,
              doctor: apt.doctor,
              totalAppointments: 1,
            });
          }
        });
        
        setPatients(Array.from(patientMap.values()));
      } catch (error) {
        console.error("Error fetching patients:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPatients();
  }, []);

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) =>
      patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.phone.includes(searchTerm)
    );
  }, [patients, searchTerm]);

  const totalPages = Math.ceil(filteredPatients.length / patientsPerPage);
  const currentPatients = filteredPatients.slice(
      (currentPage - 1) * patientsPerPage,
      currentPage * patientsPerPage
  );


  const renderPageNumbers = () => {
    const pageNumbers = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(
          <Button
            key={i}
            variant="outline"
            size="icon"
            className={currentPage === i ? "bg-primary/10 text-primary" : ""}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </Button>
        );
      }
    } else {
      pageNumbers.push(
        <Button
          key={1}
          variant="outline"
          size="icon"
          className={currentPage === 1 ? "bg-primary/10 text-primary" : ""}
          onClick={() => setCurrentPage(1)}
        >
          1
        </Button>
      );
      if (currentPage > 3) {
        pageNumbers.push(<span key="start-ellipsis" className="text-muted-foreground">...</span>);
      }
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage === 1) endPage = 3;
      if (currentPage === totalPages) startPage = totalPages - 2;

      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(
          <Button
            key={i}
            variant="outline"
            size="icon"
            className={currentPage === i ? "bg-primary/10 text-primary" : ""}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </Button>
        );
      }
      if (currentPage < totalPages - 2) {
        pageNumbers.push(<span key="end-ellipsis" className="text-muted-foreground">...</span>);
      }
       pageNumbers.push(
        <Button
          key={totalPages}
          variant="outline"
          size="icon"
          className={currentPage === totalPages ? "bg-primary/10 text-primary" : ""}
          onClick={() => setCurrentPage(totalPages)}
        >
          {totalPages}
        </Button>
      );
    }
    return pageNumbers;
  };


  return (
    <div className="flex">
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 p-6 bg-background">
          <Card>
            <CardHeader>
              <CardTitle>Patients</CardTitle>
              <div className="mt-4 flex justify-between items-center">
                  <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                          type="search"
                          placeholder="Search patients by name or phone..."
                          className="w-full rounded-lg bg-background pl-8"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                  </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button variant="ghost" size="sm">
                        Name <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm">
                        Age <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm">
                        Gender <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm">
                        Phone <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm">
                        Last Visit <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                     <TableHead>
                      <Button variant="ghost" size="sm">
                        Doctor <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: patientsPerPage }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    currentPatients.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell className="font-medium">{patient.name}</TableCell>
                        <TableCell>{patient.age}</TableCell>
                        <TableCell>{patient.gender}</TableCell>
                        <TableCell>{patient.phone}</TableCell>
                        <TableCell>{patient.lastVisit}</TableCell>
                        <TableCell>{patient.doctor}</TableCell>
                        <TableCell>
                          <Button asChild variant="link" className="p-0 h-auto text-primary">
                            <Link href={`/patients/${patient.id}`}>View History</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
               <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                    Showing{" "}
                    <Select value={`${patientsPerPage}`} onValueChange={(value) => setPatientsPerPage(Number(value))}>
                        <SelectTrigger className="inline-flex w-auto h-auto p-1 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                    </Select>{" "}
                    out of {filteredPatients.length}
                </div>
                 <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {renderPageNumbers()}
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </SidebarInset>
    </div>
  );
}
