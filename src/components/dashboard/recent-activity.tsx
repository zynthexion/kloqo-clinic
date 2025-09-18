"use client";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Calendar, UserPlus, LogOut, HeartPulse } from 'lucide-react';
import useLocalStorage from "@/hooks/use-local-storage";
import type { Activity } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";

const initialActivities: Activity[] = [
    { id: 'act-3', timestamp: new Date(Date.now() - 3600000 * 3), description: 'Vitals check for Jane Smith.', icon: HeartPulse },
    { id: 'act-2', timestamp: new Date(Date.now() - 3600000), description: 'Patient John Doe discharged from Room 201.', icon: LogOut },
    { id: 'act-1', timestamp: new Date(Date.now() - 60000), description: 'New patient, Jane Smith, admitted.', icon: UserPlus },
]

export default function RecentActivity() {
  const [activities] = useLocalStorage<Activity[]>("activities", initialActivities);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>A log of recent events.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden">
        <ScrollArea className="h-full">
            <div className="space-y-6">
            {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4">
                <div className="bg-muted rounded-full p-2">
                    <activity.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-grow">
                    <p className="text-sm">{activity.description}</p>
                    <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </p>
                </div>
                </div>
            ))}
            </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
