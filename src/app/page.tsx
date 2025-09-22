import { SidebarInset } from "@/components/ui/sidebar";
import OverviewStats from "@/components/dashboard/overview-stats";
import PatientCharts from "@/components/dashboard/patient-charts";
import { DashboardHeader } from "@/components/layout/header";
import { AppSidebar } from "@/components/layout/sidebar";
import WelcomeBanner from "@/components/dashboard/welcome-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function ProjectSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Project</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border p-4 rounded-lg">
          <h4 className="font-semibold">Baseline Project</h4>
          <p className="text-sm text-muted-foreground">of user</p>
          <p className="text-sm mt-2">Make something interesting and make your day more meaningful</p>
        </div>
        <div className="border p-4 rounded-lg">
          <h4 className="font-semibold">Paper Industry</h4>
          <p className="text-sm text-muted-foreground">of user</p>
          <p className="text-sm mt-2">Paper industry to explain the industry that is explored and pursued</p>
        </div>
        <div className="border p-4 rounded-lg">
          <h4 className="font-semibold">Tool Production</h4>
          <p className="text-sm text-muted-foreground">of user</p>
          <p className="text-sm mt-2">Tools to provide your convenience in every access</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ProfileSection() {
    return (
        <div className="col-span-1 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>My Profile</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center">
                    <img src="https://picsum.photos/seed/zaenal/100/100" alt="Zaenal Suep" className="w-24 h-24 rounded-full" />
                    <h3 className="font-semibold mt-4">Zaenal Suep</h3>
                    <p className="text-sm text-muted-foreground">zaenalsuep@gmail.com</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Team</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <img src="https://picsum.photos/seed/dhea/40/40" alt="Dhea Mufni" className="w-10 h-10 rounded-full" />
                        <div>
                            <p className="font-semibold">Dhea Mufni</p>
                            <p className="text-sm text-muted-foreground">Graphic Designer</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <img src="https://picsum.photos/seed/antonion/40/40" alt="Antonion" className="w-10 h-10 rounded-full" />
                        <div>
                            <p className="font-semibold">Antonion</p>
                            <p className="text-sm text-muted-foreground">Development</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default function Home() {
  return (
    <div className="flex">
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 p-6 bg-background">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <WelcomeBanner />
              <PatientCharts />
              <ProjectSection />
            </div>
            <ProfileSection />
          </div>
        </main>
      </SidebarInset>
    </div>
  );
}
