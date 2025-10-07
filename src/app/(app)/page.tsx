
'use client';

import { useState, Suspense } from "react";
import { format } from "date-fns";
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
import Link from "next/link";
import { useSearchParams } from "next/navigation";


function DashboardHeader({
  dateRange,
  onDateChange,
}: {
  dateRange: DateRange | undefined;
  onDateChange: (dateRange: DateRange | undefined) => void;
}) {
  return (
    <header className="flex items-center justify-between gap-4 px-6 border-b py-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>
      <div className="flex items-center gap-4">
         <DateRangePicker 
            onDateChange={onDateChange}
            initialDateRange={dateRange}
         />
         <div className="flex items-center gap-2">
            <Button variant="outline" size="icon">
                <Printer className="h-4 w-4" />
                <span className="sr-only">Print</span>
            </Button>
            <Button variant="outline" size="icon">
                <FileDown className="h-4 w-4" />
                <span className="sr-only">Download PDF</span>
            </Button>
         </div>
      </div>
    </header>
  );
}


function DashboardPageContent() {
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
      <DashboardHeader
        dateRange={dateRange}
        onDateChange={setDateRange}
      />
      <main className="flex-1 p-6 bg-background">
        <div className="space-y-6">
          <OverviewStats dateRange={dateRange} />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-3">
                <AppointmentStatusChart dateRange={dateRange} />
            </div>
            <div className="lg:col-span-6">
                <PatientsVsAppointmentsChart dateRange={dateRange} />
            </div>
            <div className="lg:col-span-3">
               <Card className="h-full flex flex-col bg-[#dcf2eb] overflow-hidden">
                  <CardContent className="flex-grow flex items-center justify-center">
                      <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={handleDateSelect}
                          className="w-full border-0 shadow-none bg-transparent [&_button]:text-base [&_caption]:text-lg"
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


export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardPageContent />
    </Suspense>
  )
}

    