
'use client';

import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MoreHorizontal, Plus, ArrowUp } from "lucide-react";
import Image from "next/image";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { TopNav } from "@/components/layout/top-nav";
import UpcomingAppointmentsDrawer from "@/components/dashboard/upcoming-appointments-drawer";


function DashboardHeader() {
  return (
    <header className="flex h-16 items-center justify-between gap-4 px-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome in, Nixtio</h1>
      </div>
      <div className="flex items-center gap-2">
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Project
        </Button>
      </div>
    </header>
  );
}

function LoraPitersonProfile() {
    return (
        <Card className="col-span-1 row-span-2 flex flex-col">
            <CardContent className="p-6 flex flex-col items-center text-center">
                <Image
                    src="https://picsum.photos/seed/lora-piterson/120/120"
                    alt="Lora Piterson"
                    width={120}
                    height={120}
                    className="rounded-full"
                    data-ai-hint="woman smiling"
                />
                <h3 className="mt-4 text-xl font-semibold">Lora Piterson</h3>
                <p className="text-muted-foreground">UX Designer</p>
                <div className="mt-2 inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-semibold">
                    $1,200
                </div>
            </CardContent>
            <div className="flex-grow p-6 pt-0 space-y-4">
                <Card className="bg-background">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Pension contributions</CardTitle>
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                </Card>
                 <Card className="bg-background">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Devices</CardTitle>
                         <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                     <CardContent>
                        <div className="flex items-center gap-4">
                            <Image src="https://picsum.photos/seed/macbook/40/40" alt="MacBook Air" width={40} height={40} className="rounded-lg"/>
                            <div>
                                <p className="font-semibold">MacBook Air</p>
                                <p className="text-sm text-muted-foreground">Version M1</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </Card>
    )
}

const progressData = [
    { label: "Interviews", value: 25, color: "bg-gray-800" },
    { label: "Hired", value: 15, color: "bg-primary" },
    { label: "Project time", value: 60, color: "bg-primary" },
]

function WelcomeMetrics() {
    return (
        <Card className="col-span-3">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div className="flex gap-4">
                        {progressData.map(item => (
                            <div key={item.label}>
                                <p className="text-sm text-muted-foreground">{item.label}</p>
                                <p className="text-2xl font-bold">{item.value}%</p>
                            </div>
                        ))}
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Output</p>
                        <p className="text-2xl font-bold">10%</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Progress value={100} className="h-3 w-full">
                    {progressData.map((item, index) => (
                        <Progress key={index} value={item.value} className={`h-3 ${item.color} absolute`} style={{ width: `${item.value}%`, left: `${progressData.slice(0, index).reduce((acc, i) => acc + i.value, 0)}%` }}/>
                    ))}
                </Progress>
            </CardContent>
        </Card>
    )
}

const activityData = [
  { day: "S", value: 20 },
  { day: "M", value: 30 },
  { day: "T", value: 45 },
  { day: "W", value: 60 },
  { day: "T", value: 40 },
  { day: "F", value: 80, isHighlight: true },
  { day: "S", value: 35 },
];

const chartConfig: ChartConfig = {
  value: { label: "Hours" },
  highlight: { label: "Highlight", color: "hsl(var(--primary))" }
};

function ProgressChart() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Progress</CardTitle>
                <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold">6.1h</p>
                    <p className="text-sm text-muted-foreground">Work time this week</p>
                </div>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig} className="w-full h-[100px]">
                    <LineChart data={activityData} accessibilityLayer margin={{ top: 5, right: 5, left: -35, bottom: 5 }}>
                        <YAxis hide domain={[0, 100]}/>
                        <XAxis dataKey="day" axisLine={false} tickLine={false} className="text-xs"/>
                        <Tooltip content={<ChartTooltipContent hideLabel />} />
                        <Line type="monotone" dataKey="value" stroke="hsl(var(--muted-foreground))" strokeWidth={3} dot={false} />
                        {activityData.map((point, index) => point.isHighlight && (
                             <Line key={index} type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} 
                                 points={[{x: 0, y: 0}, {x:0, y:0}]}
                                 // This is a hack to draw a single segment
                                 data={[activityData[index-1], activityData[index]]}
                             />
                        ))}
                    </LineChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}

function Onboarding() {
    return (
        <Card className="col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Onboarding</CardTitle>
                    <CardDescription>18%</CardDescription>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>
            <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                    <Progress value={30} className="w-[30%] h-2 bg-gray-800" />
                    <Progress value={25} className="w-[25%] h-2 bg-primary" />
                    <Progress value={10} className="w-[10%] h-2 bg-muted-foreground/50" />
                </div>
                 <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-800"/> <span>On Task</span></div>
                    <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary"/> <span>In Review</span></div>
                     <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-muted-foreground/50"/> <span>Done</span></div>
                </div>
            </CardContent>
        </Card>
    )
}

function OnboardingTask() {
    return (
        <Card className="col-span-2 bg-gray-900 text-primary-foreground">
            <CardHeader>
                <CardTitle>Onboarding Task</CardTitle>
                <CardDescription className="text-gray-400">2/8</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="flex justify-between items-center p-3 bg-gray-800/80 rounded-lg">
                    <div className="flex items-center gap-3">
                         <div className="p-2 bg-gray-700 rounded-lg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="#FFC700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 2V6" stroke="#FFC700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 2V6" stroke="#FFC700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 10H21" stroke="#FFC700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                        <div>
                            <p className="font-semibold">Interview</p>
                            <p className="text-sm text-gray-400">Sep 12, 08:30</p>
                        </div>
                    </div>
                     <div className="w-4 h-4 rounded-full bg-primary" />
                </div>
                {/* Other tasks omitted for brevity */}
            </CardContent>
        </Card>
    )
}

export default function Home() {
  return (
    <>
      <TopNav />
      <DashboardHeader />
      <main className="flex-1 p-6 bg-background">
        <div className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          <div className="lg:col-span-4 xl:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <WelcomeMetrics />
              <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <ProgressChart />
                  <UpcomingAppointmentsDrawer />
                  <Onboarding />
              </div>
               <OnboardingTask />
            </div>
          </div>

          <div className="lg:col-span-4 xl:col-span-2">
              <LoraPitersonProfile />
          </div>

        </div>
      </main>
    </>
  );
}
