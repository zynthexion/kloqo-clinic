
import Image from "next/image";
import { DepartmentsHeader } from "@/components/layout/header";
import { SidebarInset } from "@/components/ui/sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { departments, doctors } from "@/lib/data";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Department } from "@/lib/types";

const getDoctorAvatar = (doctorName: string) => {
  const doctor = doctors.find((d) => d.name === doctorName);
  return doctor ? doctor.avatar : "https://picsum.photos/seed/placeholder/100/100";
}

const DepartmentCard = ({ department }: { department: Department }) => (
    <Card className="overflow-hidden">
        <CardContent className="p-0">
            <div className="relative h-40 w-full">
                <Image
                    src={department.image}
                    alt={department.name}
                    layout="fill"
                    objectFit="cover"
                    data-ai-hint={department.imageHint}
                />
            </div>
            <div className="p-4">
                <h3 className="text-lg font-semibold">{department.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 h-10 overflow-hidden">
                    {department.description}
                </p>
                <div className="flex items-center mt-4">
                    <div className="flex -space-x-2">
                        {department.doctors.slice(0, 5).map((doctorName, index) => (
                            <Image
                                key={index}
                                src={getDoctorAvatar(doctorName)}
                                alt={doctorName}
                                width={32}
                                height={32}
                                className="rounded-full border-2 border-white"
                                data-ai-hint="doctor portrait"
                            />
                        ))}
                    </div>
                    {department.doctors.length > 5 && (
                        <span className="text-xs text-muted-foreground ml-2">
                            + {department.doctors.length - 5} others
                        </span>
                    )}
                </div>
            </div>
        </CardContent>
        <CardFooter className="bg-muted/30 px-4 py-3">
             <Button variant="link" className="ml-auto p-0 h-auto">See Detail</Button>
        </CardFooter>
    </Card>
);

export default function DepartmentsPage() {
  return (
    <SidebarInset>
      <DepartmentsHeader />
      <main className="flex-1 p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {departments.map((dept) => (
                <DepartmentCard key={dept.id} department={dept} />
            ))}
        </div>
        <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-muted-foreground">
                Showing{" "}
                <Select defaultValue="9">
                <SelectTrigger className="inline-flex w-auto h-auto p-1 text-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="9">9</SelectItem>
                    <SelectItem value="18">18</SelectItem>
                    <SelectItem value="27">27</SelectItem>
                </SelectContent>
                </Select>{" "}
                out of {departments.length}
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="bg-primary/10 text-primary">
                1
                </Button>
                <Button variant="outline" size="icon" disabled>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
      </main>
       <footer className="text-center text-sm text-muted-foreground p-4">
          Copyright &copy; 2024 Peterdraw &nbsp;&middot;&nbsp; Privacy Policy &nbsp;&middot;&nbsp; Term and conditions &nbsp;&middot;&nbsp; Contact
      </footer>
    </SidebarInset>
  );
}
