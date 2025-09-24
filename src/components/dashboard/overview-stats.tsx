
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Appointment, Doctor } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { 
    Users, 
    Stethoscope, 
    XCircle,
    CheckCircle,
    DollarSign,
    CalendarClock,
} from "lucide-react";
import { isFuture, parse, isPast, isWithinInterval, subDays, differenceInDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";


const iconMap = {
    "Total Patients": Users,
    "Total Doctors": Stethoscope,
    "Cancelled": XCircle,
    "Completed Appointments": CheckCircle,
    "Total Revenue": DollarSign,
    "Upcoming": CalendarClock,
};


type OverviewStatsProps = {
  dateRange: DateRange | undefined;
};

type Stat = {
    title: string;
    value: string | number;
    icon: string;
    change?: string;
    changeType?: 'increase' | 'decrease';
}


export default function OverviewStats({ dateRange }: OverviewStatsProps) {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const [appointmentsSnapshot, doctorsSnapshot] = await Promise.all([
          getDocs(collection(db, "appointments")),
          getDocs(collection(db, "doctors")),
        ]);

        const allAppointments = appointmentsSnapshot.docs.map(doc => doc.data() as Appointment);
        const allDoctors = doctorsSnapshot.docs.map(doc => doc.data() as Doctor);

        // --- Period Calculation ---
        const now = new Date();
        const currentFrom = dateRange?.from || subDays(now, 6);
        const currentTo = dateRange?.to || now;
        const diff = differenceInDays(currentTo, currentFrom);
        const prevFrom = subDays(currentFrom, diff + 1);
        const prevTo = subDays(currentTo, diff + 1);

        const getStatsForPeriod = (from: Date, to: Date) => {
            const periodAppointments = allAppointments.filter(apt => {
                try {
                    const aptDate = parse(apt.date, 'd MMMM yyyy', new Date());
                    return isWithinInterval(aptDate, { start: from, end: to });
                } catch { return false; }
            });

            const uniquePatients = new Set(periodAppointments.map(apt => apt.patientName + apt.phone));
            
            const completedAppointments = periodAppointments.filter(apt => apt.status === 'Confirmed' && isPast(parse(apt.date, 'd MMMM yyyy', new Date()))).length;
            const cancelledAppointments = periodAppointments.filter(apt => apt.status === 'Cancelled').length;
            
            return {
                totalPatients: uniquePatients.size,
                completedAppointments,
                cancelledAppointments,
            };
        };

        const currentStats = getStatsForPeriod(currentFrom, currentTo);
        const previousStats = getStatsForPeriod(prevFrom, prevTo);

        const calculateChange = (current: number, previous: number) => {
            if (previous === 0) return current > 0 ? "+100%" : "0%";
            const change = ((current - previous) / previous) * 100;
            if (change > 0) return `+${change.toFixed(0)}%`;
            return `${change.toFixed(0)}%`;
        };
        
        const upcomingAppointments = allAppointments.filter(apt => isFuture(parse(apt.date, 'd MMMM yyyy', new Date()))).length;

        const allStats: Stat[] = [
          { 
              title: "Total Patients", 
              value: currentStats.totalPatients, 
              icon: "Total Patients",
              change: calculateChange(currentStats.totalPatients, previousStats.totalPatients),
              changeType: currentStats.totalPatients >= previousStats.totalPatients ? 'increase' : 'decrease'
          },
          { 
              title: "Total Doctors", 
              value: allDoctors.length, 
              icon: "Total Doctors" 
          },
          { 
              title: "Completed Appointments", 
              value: currentStats.completedAppointments, 
              icon: "Completed Appointments",
              change: calculateChange(currentStats.completedAppointments, previousStats.completedAppointments),
              changeType: currentStats.completedAppointments >= previousStats.completedAppointments ? 'increase' : 'decrease'
          },
          { 
              title: "Upcoming", 
              value: upcomingAppointments, 
              icon: "Upcoming" 
          },
          { 
              title: "Cancelled", 
              value: currentStats.cancelledAppointments, 
              icon: "Cancelled",
              change: calculateChange(currentStats.cancelledAppointments, previousStats.cancelledAppointments),
              changeType: currentStats.cancelledAppointments > previousStats.cancelledAppointments ? 'decrease' : 'increase' // Less is better
          },
          { 
              title: "Total Revenue", 
              value: "$12,450", 
              icon: "Total Revenue",
              change: "+5.2%",
              changeType: "increase"
          },
        ];

        setStats(allStats);

      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    if (dateRange) {
      fetchStats();
    }
  }, [dateRange]);
  
  if (loading) {
      return (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div className="h-4 bg-muted rounded w-2/4"></div>
                          <div className="h-6 w-6 bg-muted rounded-full"></div>
                      </CardHeader>
                      <CardContent>
                          <div className="h-8 bg-muted rounded w-1/3 mt-2"></div>
                          <div className="h-4 bg-muted rounded w-1/4 mt-2"></div>
                      </CardContent>
                  </Card>
              ))}
          </div>
      );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {stats.map((stat) => {
        const Icon = iconMap[stat.icon as keyof typeof iconMap] || Users;
        return (
            <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                {stat.change && (
                  <p className={cn(
                    "text-xs text-muted-foreground",
                    stat.changeType === 'increase' ? 'text-emerald-500' : 'text-red-500'
                  )}>
                    {stat.change} from last period
                  </p>
                )}
            </CardContent>
            </Card>
        );
      })}
    </div>
  );
}
