
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Appointment } from "@/lib/types";
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
import { eachMonthOfInterval, format, isWithinInterval, parse, startOfDay } from 'date-fns';

type ChartProps = {
  dateRange: DateRange | undefined;
};

const CHART_DATA_POINTS = 12; // Show 12 months for year view

export default function PatientsVsAppointmentsChart({ dateRange }: ChartProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAppointments = async () => {
      setLoading(true);
      const appointmentsCollection = collection(db, "appointments");
      const appointmentsSnapshot = await getDocs(appointmentsCollection);
      const appointmentsList = appointmentsSnapshot.docs.map(doc => doc.data() as Appointment);
      setAppointments(appointmentsList);
      setLoading(false);
    };
    fetchAppointments();
  }, []);

  const chartData = useMemo(() => {
    if (!dateRange?.from || !dateRange.to) return [];

    const from = startOfDay(dateRange.from);
    const to = startOfDay(dateRange.to);

    const months = eachMonthOfInterval({ start: from, end: to });

    return months.map(monthStart => {
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
        const monthAppointments = appointments.filter(apt => {
            try {
                const aptDate = parse(apt.date, 'd MMMM yyyy', new Date());
                return isWithinInterval(aptDate, { start: monthStart, end: monthEnd });
            } catch { return false; }
        });

        const uniquePatients = new Set(monthAppointments.map(a => a.patientName + a.phone));
        const confirmedAppointments = monthAppointments.filter(a => a.status === 'Confirmed').length;

        // Assuming a fixed revenue per appointment for demonstration
        const revenue = confirmedAppointments * 150; 

        return {
            month: format(monthStart, "MMM"),
            patients: uniquePatients.size,
            appointments: confirmedAppointments,
            revenue: revenue,
        };
    });
  }, [appointments, dateRange]);
  
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
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-3))" fill="url(#colorRevenue)" strokeWidth={2} name="Revenue ($)" />
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
