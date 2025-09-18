"use client";

import { Bar, BarChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChartTooltipContent } from "@/components/ui/chart";

const ageData = [
  { age: "0-18", count: 8 },
  { age: "19-35", count: 15 },
  { age: "36-50", count: 23 },
  { age: "51-65", count: 18 },
  { age: "66+", count: 12 },
];

const departmentData = [
  { name: 'Cardiology', value: 400 },
  { name: 'Neurology', value: 300 },
  { name: 'Pediatrics', value: 300 },
  { name: 'Orthopedics', value: 200 },
  { name: 'Other', value: 278 },
];

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];


export default function PatientCharts() {
  return (
    <Card className="h-full flex flex-col">
        <CardHeader>
            <CardTitle>Patient Overview</CardTitle>
            <CardDescription>Distribution of patients by age and department.</CardDescription>
        </CardHeader>
      <CardContent className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col">
          <h3 className="text-sm font-medium text-center mb-2">Patients by Age Group</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ageData}>
              <XAxis dataKey="age" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'hsla(var(--muted))' }}
                content={<ChartTooltipContent />}
                />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col">
          <h3 className="text-sm font-medium text-center mb-2">Patients by Department</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Tooltip
                cursor={{ fill: 'hsla(var(--muted))' }}
                content={<ChartTooltipContent />}
              />
              <Pie
                data={departmentData}
                cx="50%"
                cy="50%"
                labelLine={false}
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={5}
                dataKey="value"
              >
                {departmentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
