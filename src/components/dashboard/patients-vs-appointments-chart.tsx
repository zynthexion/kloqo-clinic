
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

type ChartProps = {
  dateRange: DateRange | undefined;
};

const DUMMY_DATA = [
    { month: "Jan", patients: 120, appointments: 98, revenue: 14700 },
    { month: "Feb", patients: 140, appointments: 120, revenue: 18000 },
    { month: "Mar", patients: 160, appointments: 135, revenue: 20250 },
    { month: "Apr", patients: 150, appointments: 140, revenue: 21000 },
    { month: "May", patients: 180, appointments: 160, revenue: 24000 },
    { month: "Jun", patients: 170, appointments: 155, revenue: 23250 },
    { month: "Jul", patients: 190, appointments: 170, revenue: 25500 },
    { month: "Aug", patients: 210, appointments: 180, revenue: 27000 },
    { month: "Sep", patients: 200, appointments: 175, revenue: 26250 },
    { month: "Oct", patients: 220, appointments: 190, revenue: 28500 },
    { month: "Nov", patients: 230, appointments: 200, revenue: 30000 },
    { month: "Dec", patients: 250, appointments: 210, revenue: 31500 },
];


export default function PatientsVsAppointmentsChart({ dateRange }: ChartProps) {
  const [loading, setLoading] = useState(false); // No longer loading data
  const chartData = DUMMY_DATA;
  
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
