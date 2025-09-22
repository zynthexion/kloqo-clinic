
import { AppointmentsHeader } from "@/components/layout/header";
import { SidebarInset } from "@/components/ui/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { appointments } from "@/lib/data";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  ArrowUpDown,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppSidebar } from "@/components/layout/sidebar";

export default function AppointmentsPage() {
  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <AppointmentsHeader />
        <main className="flex-1 p-4 sm:p-6">
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All (128)</TabsTrigger>
              <TabsTrigger value="confirmed">Confirmed (98)</TabsTrigger>
              <TabsTrigger value="pending">Pending (18)</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled (12)</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox />
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Name <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Date <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Time <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Doctor <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Treatment <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button variant="ghost" size="sm">
                              Status <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appointments.map((appointment) => (
                          <TableRow key={appointment.id}>
                            <TableCell>
                              <Checkbox />
                            </TableCell>
                            <TableCell className="font-medium">
                              {appointment.patientName}
                            </TableCell>
                            <TableCell>{appointment.date}</TableCell>
                            <TableCell>{appointment.time}</TableCell>
                            <TableCell>{appointment.doctor}</TableCell>
                            <TableCell>{appointment.treatment}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  appointment.status === "Confirmed"
                                    ? "success"
                                    : appointment.status === "Pending"
                                    ? "warning"
                                    : "outline"
                                }
                              >
                                {appointment.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button variant="link" className="p-0 h-auto text-primary">
                                  Reschedule
                                </Button>
                                <Button variant="link" className="p-0 h-auto text-muted-foreground">
                                  Cancel
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Showing{" "}
              <Select defaultValue="13">
                <SelectTrigger className="inline-flex w-auto h-auto p-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="13">13</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>{" "}
              out of 128
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="bg-primary/10 text-primary">
                1
              </Button>
              <Button variant="outline" size="icon">
                2
              </Button>
              <Button variant="outline" size="icon">
                3
              </Button>
              <span className="text-muted-foreground">...</span>
              <Button variant="outline" size="icon">
                10
              </Button>
              <Button variant="outline" size="icon">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </main>
      </SidebarInset>
    </>
  );
}
