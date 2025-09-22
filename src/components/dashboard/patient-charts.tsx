"use client";

import { Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, Cell, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChartConfig } from "@/components/ui/chart";

const activityData = [
  { day: "Mon", value: 32 },
  { day: "Tue", value: 45 },
  { day: "Wed", value: 60 },
  { day: "Thu", value: 55 },
  { day: "Fri", value: 75 },
  { day: "Sat", value: 80 },
  { day: "Sun", value: 70 },
];


const chartConfig: ChartConfig = {
  value: {
    label: "Activity",
    color: "hsl(var(--primary))",
  }
};


export default function PatientCharts() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>This Week</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
            <ChartContainer config={chartConfig} className="w-full h-[250px]">
                <LineChart data={activityData} accessibilityLayer margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip
                        cursor={{ fill: 'hsla(var(--muted))' }}
                        content={<ChartTooltipContent />}
                    />
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{r: 4, fill: "hsl(var(--primary))"}} />
                </LineChart>
            </ChartContainer>
      </CardContent>
    </Card>
  );
}
