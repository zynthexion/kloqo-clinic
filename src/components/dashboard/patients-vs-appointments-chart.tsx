
"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "../ui/skeleton";
import type { DateRange } from "react-day-picker";
import { 
    AreaChart, 
    Area, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer, 
    Legend 
} from 'recharts';
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/firebase";
import type { Appointment, Doctor } from "@/lib/types";
import {
  format,
  eachDayOfInterval,
  eachMonthOfInterval,
  isWithinInterval,
  parse,
  differenceInDays,
  startOfDay,
  startOfMonth,
  endOfMonth,
} from "date-fns";


type ChartProps = {
  dateRange: DateRange | undefined;
};


export default function PatientsVsAppointmentsChart({ dateRange }: ChartProps) {
  const auth = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const userDocRef = collection(db, "users");
        const userQuery = query(userDocRef, where("uid", "==", auth.currentUser!.uid));
        const userSnapshot = await getDocs(userQuery);
        if (userSnapshot.empty) {
          setLoading(false);
          return;
        }
        const clinicId = userSnapshot.docs[0].data().clinicId;
        if (!clinicId) {
          setLoading(false);
          return;
        }

        const appointmentsQuery = query(collection(db, "appointments"), where("clinicId", "==", clinicId));
        const doctorsQuery = query(collection(db, "doctors"), where("clinicId", "==", clinicId));

        const [appointmentsSnapshot, doctorsSnapshot] = await Promise.all([
          getDocs(appointmentsQuery),
          getDocs(doctorsQuery),
        ]);

        setAppointments(appointmentsSnapshot.docs.map(doc => doc.data() as Appointment));
        setDoctors(doctorsSnapshot.docs.map(doc => doc.data() as Doctor));
      } catch (error) {
        console.error("Error fetching chart data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [auth.currentUser]);

  const chartData = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to || appointments.length === 0) return [];

    const from = startOfDay(dateRange.from);
    const to = startOfDay(dateRange.to);
    const dayCount = differenceInDays(to, from);

    const isMonthlyView = dayCount > 60;
    
    if (isMonthlyView) {
      const months = eachMonthOfInterval({ start: from, end: to });
      return months.map(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const monthAppointments = appointments.filter(apt => {
          try {
            return isWithinInterval(parse(apt.date, 'd MMMM yyyy', new Date()), { start: monthStart, end: monthEnd });
          } catch { return false; }
        });
        
        const patients = new Set(monthAppointments.map(a => a.patientId)).size;
        const totalAppointments = monthAppointments.length;
        
        const completed = monthAppointments.filter(apt => apt.status === 'Completed');
        let revenue = 0;
        completed.forEach(apt => {
            const doctor = doctors.find(d => d.name === apt.doctor);
            if(doctor) revenue += doctor.consultationFee || 0;
        });

        return {
          month: format(monthStart, 'MMM yyyy'),
          patients,
          appointments: totalAppointments,
          revenue,
        };
      });
    } else {
      const days = eachDayOfInterval({ start: from, end: to });
      return days.map(day => {
        const dayAppointments = appointments.filter(apt => {
          try {
            return isWithinInterval(parse(apt.date, 'd MMMM yyyy', new Date()), { start: day, end: day });
          } catch { return false; }
        });

        const patients = new Set(dayAppointments.map(a => a.patientId)).size;
        const totalAppointments = dayAppointments.length;
        const completed = dayAppointments.filter(apt => apt.status === 'Completed');
        let revenue = 0;
        completed.forEach(apt => {
            const doctor = doctors.find(d => d.name === apt.doctor);
            if(doctor) revenue += doctor.consultationFee || 0;
        });

        return {
          month: format(day, 'MMM d'),
          patients,
          appointments: totalAppointments,
          revenue,
        };
      });
    }

  }, [dateRange, appointments, doctors]);
  
  if (loading) {
    return (
        <Card className="h-full flex flex-col">
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="flex-grow flex items-center justify-center">
            <Skeleton className="h-full w-full" />
          </CardContent>
        </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Analytics Overview</CardTitle>
        <CardDescription>Patients, appointments, and revenue over time.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex items-center justify-center pr-6">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPatients" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorAppointments" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
              <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{
                    background: "hsl(var(--background))",
                    borderRadius: "var(--radius)",
                    border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend 
                verticalAlign="top" 
                align="right" 
                iconType="circle" 
                iconSize={8}
                wrapperStyle={{ top: -10, right: 0 }}
              />
              <Area type="monotone" dataKey="patients" stroke="hsl(var(--chart-1))" fill="url(#colorPatients)" strokeWidth={2} name="Patients" />
              <Area type="monotone" dataKey="appointments" stroke="hsl(var(--chart-2))" fill="url(#colorAppointments)" strokeWidth={2} name="Appointments" />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-3))" fill="url(#colorRevenue)" strokeWidth={2} name="Revenue (₹)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                 <p className="text-sm">Not enough data to display chart for this period.</p>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
