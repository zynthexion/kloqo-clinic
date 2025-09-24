
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Appointment } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { DateRange } from "react-day-picker";
import { isWithinInterval, parse, isPast, isFuture, startOfDay } from "date-fns";
import { Skeleton } from "../ui/skeleton";

const COLORS = {
  completed: "hsl(var(--chart-2))",
  upcoming: "hsl(var(--chart-1))",
  cancelled: "hsl(var(--chart-3))",
  didNotShow: "hsl(var(--destructive))",
};

const ALL_STATUSES = ["completed", "upcoming", "cancelled", "didNotShow"];

const statusLabels: { [key: string]: string } = {
  completed: "Completed",
  upcoming: "Upcoming",
  cancelled: "Cancelled",
  didNotShow: "Didn't Show Up",
};

type AppointmentStatusChartProps = {
  dateRange: DateRange | undefined;
};

export default function AppointmentStatusChart({ dateRange }: AppointmentStatusChartProps) {
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
    if (!dateRange?.from) return [];

    const from = startOfDay(dateRange.from);
    const to = dateRange.to ? startOfDay(dateRange.to) : from;

    const rangeAppointments = appointments.filter(apt => {
      try {
        const aptDate = parse(apt.date, 'd MMMM yyyy', new Date());
        return isWithinInterval(aptDate, { start: from, end: to });
      } catch {
        return false;
      }
    });

    const completed = rangeAppointments.filter(apt => apt.status === 'Confirmed' && isPast(parse(apt.date, 'd MMMM yyyy', new Date()))).length;
    const upcoming = rangeAppointments.filter(apt => (apt.status === 'Confirmed' || apt.status === 'Pending') && isFuture(parse(apt.date, 'd MMMM yyyy', new Date()))).length;
    const cancelled = rangeAppointments.filter(apt => apt.status === 'Cancelled').length;
    const didNotShow = rangeAppointments.filter(apt => apt.status === 'Pending' && isPast(parse(apt.date, 'd MMMM yyyy', new Date()))).length;

    return [
      { name: "completed", value: completed },
      { name: "upcoming", value: upcoming },
      { name: "cancelled", value: cancelled },
      { name: "didNotShow", value: didNotShow },
    ].filter(item => item.value > 0);

  }, [appointments, dateRange]);
  
  if (loading) {
    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="flex-grow flex items-center justify-center">
                 <Skeleton className="h-48 w-48 rounded-full" />
            </CardContent>
             <CardFooter>
                 <Skeleton className="h-6 w-full" />
            </CardFooter>
        </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Appointment Overview</CardTitle>
        <CardDescription>Status of appointments in the selected period.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex items-center justify-center p-0">
        {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                    <Tooltip
                        contentStyle={{
                            background: "hsl(var(--background))",
                            borderRadius: "var(--radius)",
                            border: "1px solid hsl(var(--border))",
                        }}
                        labelFormatter={(value) => statusLabels[value]}
                    />
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        innerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                        nameKey="name"
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
                        ))}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
        ) : (
            <p className="text-sm text-muted-foreground">No appointment data for this period.</p>
        )}
      </CardContent>
      {chartData.length > 0 && (
        <CardFooter className="flex-col gap-2 text-sm pt-4">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                {ALL_STATUSES.map(status => (
                    <div key={status} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[status as keyof typeof COLORS] }} />
                        <span className="text-muted-foreground">{statusLabels[status]}</span>
                    </div>
                ))}
            </div>
        </CardFooter>
      )}
    </Card>
  );
}
