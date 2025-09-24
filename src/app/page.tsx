
'use client';

import { useState } from "react";
import { format } from "date-fns";
import { TopNav } from "@/components/layout/top-nav";
import OverviewStats from "@/components/dashboard/overview-stats";
import RecentActivity from "@/components/dashboard/recent-activity";
import DoctorAvailability from "@/components/dashboard/doctor-availability";
import TodaysAppointments from "@/components/dashboard/todays-appointments";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";
import { subDays } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Printer, FileDown } from "lucide-react";
import AppointmentStatusChart from "@/components/dashboard/appointment-status-chart";
import PatientsVsAppointmentsChart from "@/components/dashboard/patients-vs-appointments-chart";

function DashboardHeader({
  dateRange,
  onDateRangeChange,
}: {
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
}) {
  return (
    <header className="flex h-16 items-center justify-between gap-4 px-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {dateRange?.from ? 
            dateRange.to ? `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`
            : format(dateRange.from, "LLL dd, y")
            : "Select a date range"
          }
        </p>
      </div>
      <div className="flex items-center gap-2">
         <DateRangePicker 
            onDateChange={onDateRangeChange}
            initialDateRange={dateRange}
         />
         <Button variant="outline" size="icon">
            <Printer className="h-4 w-4" />
            <span className="sr-only">Print</span>
         </Button>
         <Button variant="outline" size="icon">
            <FileDown className="h-4 w-4" />
            <span className="sr-only">Download PDF</span>
         </Button>
      </div>
    </header>
  );
}


export default function Home() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 6),
    to: new Date(),
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  return (
    <>
      <TopNav />
      <DashboardHeader
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />
      <main className="flex-1 p-6 bg-background">
        <div className="space-y-6">
          <OverviewStats dateRange={dateRange} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
                <AppointmentStatusChart dateRange={dateRange} />
            </div>
            <div className="lg:col-span-1">
                <PatientsVsAppointmentsChart dateRange={dateRange} />
            </div>
            <div className="lg:col-span-1">
               <Card className="h-full flex flex-col">
                  <CardContent className="p-2 flex-grow flex items-center justify-center">
                      <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={handleDateSelect}
                          className="w-full border-0 shadow-none"
                      />
                  </CardContent>
                </Card>
            </div>
          </div>
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-1">
                <RecentActivity />
            </div>
            <div className="lg:col-span-1">
                <TodaysAppointments selectedDate={selectedDate} />
            </div>
            <div className="lg:col-span-1">
                <DoctorAvailability selectedDate={selectedDate} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
