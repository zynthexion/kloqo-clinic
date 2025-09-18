"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { reports } from "@/lib/data";
import { Bed, Monitor } from "lucide-react";
import type { Report } from "@/lib/types";

const getBadgeVariant = (status: string) => {
  switch (status) {
    case "Clean":
    case "Available":
      return "default";
    case "Occupied":
    case "In Use":
      return "secondary";
    case "Needs Cleaning":
    case "Maintenance":
      return "destructive";
    default:
      return "outline";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "Clean":
    case "Available":
      return "bg-green-500";
    case "Occupied":
    case "In Use":
      return "bg-yellow-500";
    case "Needs Cleaning":
    case "Maintenance":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}

export default function RealTimeReports() {
  const [reportStatuses, setReportStatuses] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    const initialStatuses = reports.reduce((acc, report) => {
      acc[report.id] = 0;
      return acc;
    }, {} as { [key: string]: number });
    setReportStatuses(initialStatuses);

    const interval = setInterval(() => {
      setReportStatuses(prevStatuses => {
        const newStatuses = { ...prevStatuses };
        const reportToUpdate = reports[Math.floor(Math.random() * reports.length)];
        newStatuses[reportToUpdate.id] = (newStatuses[reportToUpdate.id] + 1) % reportToUpdate.statuses.length;
        return newStatuses;
      });
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Real-time Reports</CardTitle>
        <CardDescription>Live status of rooms and equipment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 overflow-auto">
        {reports.map((report) => {
            const currentStatusIndex = reportStatuses[report.id] || 0;
            const currentStatus = report.statuses[currentStatusIndex];
            return (
                <div key={report.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                        {report.type === 'room' ? <Bed className="w-5 h-5 text-muted-foreground" /> : <Monitor className="w-5 h-5 text-muted-foreground" />}
                        <span className="font-medium text-sm">{report.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${getStatusColor(currentStatus)}`}></div>
                        <Badge variant={getBadgeVariant(currentStatus)} className="w-[100px] justify-center">{currentStatus}</Badge>
                    </div>
                </div>
            )
        })}
      </CardContent>
    </Card>
  );
}
