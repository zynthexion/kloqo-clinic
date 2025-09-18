import { AppSidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import OverviewStats from "@/components/dashboard/overview-stats";
import PatientCharts from "@/components/dashboard/patient-charts";
import DoctorAvailability from "@/components/dashboard/doctor-availability";
import CalendarView from "@/components/dashboard/calendar-view";
import RealTimeReports from "@/components/dashboard/real-time-reports";
import RecentActivity from "@/components/dashboard/recent-activity";

export default function Home() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
          <OverviewStats />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <PatientCharts />
            </div>
            <div className="lg:col-span-2">
              <DoctorAvailability />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <CalendarView />
            <RealTimeReports />
            <RecentActivity />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
