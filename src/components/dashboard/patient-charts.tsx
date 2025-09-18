"use client";

import { Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, Cell, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChartConfig } from "@/components/ui/chart";

const satisfactionData = [
  { month: "Jan", satisfaction: 82 },
  { month: "Feb", satisfaction: 85 },
  { month: "Mar", satisfaction: 88 },
  { month: "Apr", satisfaction: 86 },
  { month: "May", satisfaction: 90 },
  { month: "Jun", satisfaction: 92 },
];

const departmentData = [
  { name: 'Cardiology', value: 400, fill: "hsl(var(--chart-1))" },
  { name: 'Neurology', value: 300, fill: "hsl(var(--chart-2))" },
  { name: 'Oncology', value: 300, fill: "hsl(var(--chart-3))" },
  { name: 'Pediatrics', value: 200, fill: "hsl(var(--chart-4))" },
  { name: 'Other', value: 278, fill: "hsl(var(--chart-5))" },
];

const chartConfig: ChartConfig = {
  satisfaction: {
    label: "Satisfaction (%)",
    color: "hsl(var(--primary))",
  },
  Cardiology: { label: "Cardiology", color: "hsl(var(--chart-1))" },
  Neurology: { label: "Neurology", color: "hsl(var(--chart-2))" },
  Oncology: { label: "Oncology", color: "hsl(var(--chart-3))" },
  Pediatrics: { label: "Pediatrics", color: "hsl(var(--chart-4))" },
  Other: { label: "Other", color: "hsl(var(--chart-5))" },
};


export default function PatientCharts() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
          <CardTitle>Patient Overview</CardTitle>
          <CardDescription>Key metrics about patient population and satisfaction.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <Tabs defaultValue="satisfaction">
          <TabsList>
            <TabsTrigger value="satisfaction">Patient Satisfaction</TabsTrigger>
            <TabsTrigger value="departments">Department Visits</TabsTrigger>
          </TabsList>
          <TabsContent value="satisfaction" className="pt-4">
            <ChartContainer config={chartConfig} className="w-full h-[250px]">
                <LineChart data={satisfactionData} accessibilityLayer margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                        cursor={{ fill: 'hsla(var(--muted))' }}
                        content={<ChartTooltipContent />}
                    />
                    <Line type="monotone" dataKey="satisfaction" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
            </ChartContainer>
          </TabsContent>
          <TabsContent value="departments" className="pt-4">
            <ChartContainer config={chartConfig} className="w-full h-[250px]">
                <PieChart accessibilityLayer>
                  <Tooltip
                    cursor={{ fill: 'hsla(var(--muted))' }}
                    content={<ChartTooltipContent nameKey="name" />}
                  />
                  <Pie
                    data={departmentData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {departmentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ChartContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
