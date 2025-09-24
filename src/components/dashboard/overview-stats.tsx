
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
    PersonStanding,
    Phone,
    Computer,
    XCircle,
    Repeat,
    CheckCircle,
    DollarSign,
    CalendarClock,
} from "lucide-react";
import { format, isFuture, parse, isPast, isWithinInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

const iconMap = {
    "Total Appointments": BriefcaseMedical,
    "Total Patients": Users,
    "Total Doctors": Stethoscope,
    "Walk-in": PersonStanding,
    "Phone": Phone,
    "Online": Computer,
    "Cancelled": XCircle,
    "Rescheduled": Repeat,
    "Completed": CheckCircle,
    "Total Revenue": DollarSign,
    "Upcoming": CalendarClock,
};

type FilterRange = "weekly" | "monthly" | "yearly";

type OverviewStatsProps = {
  selectedDate: Date;
  filterRange: FilterRange;
};


export default function OverviewStats({ selectedDate, filterRange }: OverviewStatsProps) {
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

        let interval;
        switch (filterRange) {
          case 'weekly':
            interval = { start: startOfWeek(selectedDate), end: endOfWeek(selectedDate) };
            break;
          case 'monthly':
            interval = { start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) };
            break;
          case 'yearly':
            interval = { start: startOfYear(selectedDate), end: endOfYear(selectedDate) };
            break;
        }
        
        const appointments = allAppointments.filter(apt => {
            const aptDate = parse(apt.date, 'd MMMM yyyy', new Date());
            return isWithinInterval(aptDate, interval);
        });

        const totalAppointments = appointments.length;

        const uniquePatients = new Set(appointments.map(apt => apt.patientName + apt.phone));
        const totalPatients = uniquePatients.size;
        
        const totalDoctors = allDoctors.length;

        const walkInAppointments = appointments.filter(apt => apt.bookedVia === 'Walk-in').length;
        const phoneAppointments = appointments.filter(apt => apt.bookedVia === 'Phone').length;
        const onlineAppointments = appointments.filter(apt => apt.bookedVia === 'Online').length;
        
        const cancelledAppointments = appointments.filter(apt => apt.status === 'Cancelled').length;
        const rescheduledAppointments = 0; 
        const completedAppointments = appointments.filter(apt => apt.status === 'Confirmed' && isPast(parse(apt.date, 'd MMMM yyyy', new Date()))).length;
        
        const totalRevenue = "$12,450";

        const upcomingAppointments = allAppointments.filter(apt => isFuture(parse(apt.date, 'd MMMM yyyy', new Date()))).length;

        const allStats = [
          { title: "Total Appointments", value: totalAppointments, icon: "Total Appointments" },
          { title: "Total Patients", value: totalPatients, icon: "Total Patients" },
          { title: "Total Doctors", value: totalDoctors, icon: "Total Doctors" },
          { title: "Walk-in", value: walkInAppointments, icon: "Walk-in" },
          { title: "Phone", value: phoneAppointments, icon: "Phone" },
          { title: "Online", value: onlineAppointments, icon: "Online" },
          { title: "Cancelled", value: cancelledAppointments, icon: "Cancelled" },
          { title: "Rescheduled", value: rescheduledAppointments, icon: "Rescheduled" },
          { title: "Completed", value: completedAppointments, icon: "Completed" },
          { title: "Total Revenue", value: totalRevenue, icon: "Total Revenue" },
          { title: "Upcoming", value: upcomingAppointments, icon: "Upcoming" },
        ];

        setStats(allStats);

      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [selectedDate, filterRange]);
  
  if (loading) {
      return (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              {Array.from({ length: 11 }).map((_, i) => (
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
