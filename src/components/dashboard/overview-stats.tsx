
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Appointment, Doctor } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { 
    Users, 
    BriefcaseMedical, 
    Stethoscope, 
    XCircle,
    Repeat,
    CheckCircle,
    DollarSign,
    CalendarClock,
} from "lucide-react";
import { isFuture, parse, isPast, isWithinInterval } from "date-fns";
import type { DateRange } from "react-day-picker";


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


export default function OverviewStats({ dateRange }: OverviewStatsProps) {
  const [stats, setStats] = useState<any[]>([]);
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
        
        const appointments = dateRange?.from ? allAppointments.filter(apt => {
            try {
                const aptDate = parse(apt.date, 'd MMMM yyyy', new Date());
                 return isWithinInterval(aptDate, { start: dateRange.from!, end: dateRange.to || dateRange.from! });
            } catch {
                return false;
            }
        }) : allAppointments;

        const uniquePatients = new Set(appointments.map(apt => apt.patientName + apt.phone));
        const totalPatients = uniquePatients.size;
        
        const totalDoctors = allDoctors.length;
        
        const cancelledAppointments = appointments.filter(apt => apt.status === 'Cancelled').length;
        const completedAppointments = appointments.filter(apt => {
            try {
               return apt.status === 'Confirmed' && isPast(parse(apt.date, 'd MMMM yyyy', new Date()))
            } catch {
                return false;
            }
        }).length;
        
        const totalRevenue = "$12,450";

        const upcomingAppointments = allAppointments.filter(apt => {
            try {
                return isFuture(parse(apt.date, 'd MMMM yyyy', new Date()))
            } catch {
                return false;
            }
        }).length;

        const allStats = [
          { title: "Total Patients", value: totalPatients, icon: "Total Patients" },
          { title: "Total Doctors", value: totalDoctors, icon: "Total Doctors" },
          { title: "Upcoming", value: upcomingAppointments, icon: "Upcoming" },
          { title: "Completed Appointments", value: completedAppointments, icon: "Completed Appointments" },
          { title: "Cancelled", value: cancelledAppointments, icon: "Cancelled" },
          { title: "Total Revenue", value: totalRevenue, icon: "Total Revenue" },
        ];

        setStats(allStats);

      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
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
                          <div className="h-8 bg-muted rounded w-1/3"></div>
                      </CardContent>
                  </Card>
              ))}
          </div>
      );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {stats.map((stat, index) => {
        const Icon = iconMap[stat.icon as keyof typeof iconMap] || Users;
        return (
            <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
            </Card>
        );
      })}
    </div>
  );
}

