import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileText, Users, Calendar, BedDouble } from "lucide-react";

const stats = [
  {
    title: "Total Invoices",
    value: "$125,430",
    change: "+20.1% from last month",
    icon: FileText,
  },
  {
    title: "Total Patients",
    value: "1,234",
    change: "+180 since last week",
    icon: Users,
  },
  {
    title: "Appointments",
    value: "356",
    change: "+19% from last month",
    icon: Calendar,
  },
  {
    title: "Bed Occupancy",
    value: "78%",
    change: "52 of 67 beds filled",
    icon: BedDouble,
  },
];

export default function OverviewStats() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.change}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
