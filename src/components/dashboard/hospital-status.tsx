"use client";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const statusItems = [
    { title: "Beds Occupied", value: 78, total: 120 },
    { title: "Doctors on Duty", value: 32, total: 45 },
    { title: "Nurses on Duty", value: 89, total: 110 },
    { title: "On-call Specialists", value: 12, total: 20 },
]

export default function HospitalStatus() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Hospital Status</CardTitle>
        <CardDescription>Live overview of hospital capacity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {statusItems.map(item => (
            <div key={item.title} className="space-y-2">
                <div className="flex justify-between items-baseline">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">
                        <span className="font-bold text-foreground">{item.value}</span>/{item.total}
                    </p>
                </div>
                <Progress value={(item.value / item.total) * 100} />
            </div>
        ))}
      </CardContent>
    </Card>
  );
}
