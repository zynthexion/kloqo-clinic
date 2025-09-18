import { SidebarInset } from "@/components/ui/sidebar";
import OverviewStats from "@/components/dashboard/overview-stats";
import PatientCharts from "@/components/dashboard/patient-charts";
import DoctorAvailability from "@/components/dashboard/doctor-availability";
import UpcomingAppointments from "@/components/dashboard/upcoming-appointments";
import HospitalStatus from "@/components/dashboard/hospital-status";
import RecentActivity from "@/components/dashboard/recent-activity";
import { DashboardHeader } from "@/components/layout/header";

export default function Home() {
  return (
    <SidebarInset>
      <DashboardHeader />
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
          <UpcomingAppointments />
          <HospitalStatus />
          <RecentActivity />
        </div>
      </main>
    </SidebarInset>
  );
}
