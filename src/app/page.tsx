
'use client';

import { useState } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import OverviewStats from "@/components/dashboard/overview-stats";
import PatientCharts from "@/components/dashboard/patient-charts";
import { AppSidebar } from "@/components/layout/sidebar";
import WelcomeBanner from "@/components/dashboard/welcome-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Edit, Save, X } from "lucide-react";
import { Input } from "@/components/ui/input";

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

function EditableDashboardHeader() {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("Dashboard");
  const [dateRange, setDateRange] = useState("Aug - Dec 2021");

  const [editTitle, setEditTitle] = useState(title);
  const [editDateRange, setEditDateRange] = useState(dateRange);

  const handleSave = () => {
    setTitle(editTitle);
    setDateRange(editDateRange);
    setIsEditing(false);
  }

  const handleCancel = () => {
    setEditTitle(title);
    setEditDateRange(dateRange);
    setIsEditing(false);
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 bg-background/80 backdrop-blur-sm px-6">
      <div>
        {isEditing ? (
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-2xl font-bold h-10 mb-1" />
        ) : (
          <h1 className="text-2xl font-bold">{title}</h1>
        )}
        <p className="text-sm text-muted-foreground">{format(new Date(), "eeee, dd MMMM yyyy")}</p>
      </div>
      <div className="flex items-center gap-2">
        {isEditing ? (
           <Input value={editDateRange} onChange={(e) => setEditDateRange(e.target.value)} className="h-9" />
        ) : (
          <Button size="sm" className="gap-1 rounded-full" variant="outline">
            <CalendarIcon className="h-4 w-4" />
            <span className="sm:whitespace-nowrap">
              {dateRange}
            </span>
          </Button>
        )}
        {isEditing ? (
          <>
            <Button size="icon" className="h-9 w-9" onClick={handleSave}><Save className="h-4 w-4"/></Button>
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={handleCancel}><X className="h-4 w-4"/></Button>
          </>
        ) : (
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setIsEditing(true)}><Edit className="h-4 w-4"/></Button>
        )}
      </div>
    </header>
  );
}


export default function Home() {
  return (
    <div className="flex">
      <AppSidebar />
      <SidebarInset>
        <EditableDashboardHeader />
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
