
'use client';

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { TopNav } from "@/components/layout/top-nav";
import OverviewStats from "@/components/dashboard/overview-stats";
import RecentActivity from "@/components/dashboard/recent-activity";
import DoctorAvailability from "@/components/dashboard/doctor-availability";
import TodaysAppointments from "@/components/dashboard/todays-appointments";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";

type FilterRange = "weekly" | "monthly" | "yearly";

function DashboardHeader({
  selectedDate,
  filterRange,
  onDateChange,
  onFilterChange,
}: {
  selectedDate: Date;
  filterRange: FilterRange;
  onDateChange: (date: Date) => void;
  onFilterChange: (range: FilterRange) => void;
}) {
  return (
    <header className="flex h-16 items-center justify-between gap-4 px-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{format(selectedDate, "eeee, dd MMMM yyyy")}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          variant={filterRange === 'weekly' ? 'default' : 'outline'}
          onClick={() => onFilterChange('weekly')}
        >
          Weekly
        </Button>
        <Button 
          variant={filterRange === 'monthly' ? 'default' : 'outline'}
          onClick={() => onFilterChange('monthly')}
        >
          Monthly
        </Button>
         <Button 
          variant={filterRange === 'yearly' ? 'default' : 'outline'}
          onClick={() => onFilterChange('yearly')}
        >
          Yearly
        </Button>
      </div>
    </header>
  );
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filterRange, setFilterRange] = useState<FilterRange>("monthly");
  
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  return (
    <>
      <TopNav />
      <DashboardHeader
        selectedDate={selectedDate}
        filterRange={filterRange}
        onDateChange={setSelectedDate}
        onFilterChange={setFilterRange}
      />
      <main className="flex-1 p-6 bg-background">
        <div className="space-y-6">
          <OverviewStats selectedDate={selectedDate} filterRange={filterRange} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
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
            <div className="lg:col-span-1">
              <TodaysAppointments selectedDate={selectedDate} />
            </div>
          </div>
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2">
                <DoctorAvailability />
            </div>
            <div className="lg:col-span-1">
                <RecentActivity />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
