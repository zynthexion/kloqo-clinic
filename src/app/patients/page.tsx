
import { SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/sidebar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DashboardHeader } from "@/components/layout/header";

export default function PatientsPage() {
  return (
    <div className="flex">
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 p-6 bg-background">
          <Card>
            <CardHeader>
              <CardTitle>Patients</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Patient management functionality will be implemented here.</p>
            </CardContent>
          </Card>
        </main>
      </SidebarInset>
    </div>
  );
}
