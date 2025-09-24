
'use client';

import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TopNav } from "@/components/layout/top-nav";
import OverviewStats from "@/components/dashboard/overview-stats";
import PatientCharts from "@/components/dashboard/patient-charts";
import RecentActivity from "@/components/dashboard/recent-activity";
import DoctorAvailability from "@/components/dashboard/doctor-availability";
import TodaysAppointments from "@/components/dashboard/todays-appointments";

function DashboardHeader() {
  return (
    <header className="flex h-16 items-center justify-between gap-4 px-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, Clinic Administrator</h1>
        <p className="text-sm text-muted-foreground">{format(new Date(), "eeee, dd MMMM yyyy")}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Appointment
        </Button>
      </div>
    </header>
  );
}

export default function Home() {
  return (
    <>
      <TopNav />
      <DashboardHeader />
      <main className="flex-1 p-6 bg-background">
        <div className="space-y-6">
          <OverviewStats />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <PatientCharts />
            </div>
            <div className="lg:col-span-1">
              <TodaysAppointments />
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
