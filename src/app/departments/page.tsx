
"use client";

import Image from "next/image";
import { DepartmentsHeader } from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  MoreHorizontal,
  Edit,
  Trash,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Department, Doctor } from "@/lib/types";
import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { DepartmentDoctorsDialog } from "@/components/departments/department-doctors-dialog";
import { SelectDepartmentDialog } from "@/components/onboarding/select-department-dialog";

const superAdminDepartments: Department[] = [
    { id: 'dept-01', name: 'General Medicine', description: 'Comprehensive primary care.', image: 'https://picsum.photos/seed/gm/600/400', imageHint: 'stethoscope pills', doctors: [] },
    { id: 'dept-02', name: 'Cardiology', description: 'Specialized heart care.', image: 'https://picsum.photos/seed/cardio/600/400', imageHint: 'heart model', doctors: [] },
    { id: 'dept-03', name: 'Pediatrics', description: 'Healthcare for children.', image: 'https://picsum.photos/seed/peds/600/400', imageHint: 'doctor baby', doctors: [] },
    { id: 'dept-04', name: 'Dermatology', description: 'Skin health services.', image: 'https://picsum.photos/seed/derma/600/400', imageHint: 'skin care', doctors: [] },
    { id: 'dept-05', name: 'Neurology', description: 'Nervous system disorders.', image: 'https://picsum.photos/seed/neuro/600/400', imageHint: 'brain model', doctors: [] },
    { id: 'dept-06', name: 'Orthopedics', description: 'Musculoskeletal system disorders.', image: 'https://picsum.photos/seed/ortho/600/400', imageHint: 'joint brace', doctors: [] },
    { id: 'dept-07', name: 'Oncology', description: 'Cancer diagnosis and treatment.', image: 'https://picsum.photos/seed/onco/600/400', imageHint: 'awareness ribbon', doctors: [] },
    { id: 'dept-08', name: 'Obstetrics and Gynecology (OB/GYN)', description: 'Women\'s health services.', image: 'https://picsum.photos/seed/obgyn/600/400', imageHint: 'pregnant woman', doctors: [] },
];


export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const { toast } = useToast();
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [isDoctorsDialogOpen, setIsDoctorsDialogOpen] = useState(false);
  const [deletingDepartment, setDeletingDepartment] = useState<Department | null>(null);


  useEffect(() => {
    const fetchDepartments = async () => {
      const departmentsCollection = collection(db, "departments");
      const departmentsSnapshot = await getDocs(departmentsCollection);
      const departmentsList = departmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
      setDepartments(departmentsList);
    };

    const fetchDoctors = async () => {
        const doctorsCollection = collection(db, "doctors");
        const doctorsSnapshot = await getDocs(doctorsCollection);
        const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);
    };

    fetchDepartments();
    fetchDoctors();
  }, []);

  const getDoctorAvatar = (doctorName: string) => {
    const doctor = doctors.find((d) => d.name === doctorName);
    return doctor ? doctor.avatar : "https://picsum.photos/seed/generic-doctor/100/100";
  }

  const DepartmentCard = ({ department, onSeeDetail, onDelete }: { department: Department, onSeeDetail: (department: Department) => void, onDelete: (department: Department) => void }) => (
      <Card className="overflow-hidden flex flex-col">
          <div className="relative h-40 w-full">
              <Image
                  src={department.image}
                  alt={department.name}
                  fill
                  style={{objectFit: "cover"}}
                  data-ai-hint={department.imageHint}
              />
          </div>
          <CardContent className="p-4 flex-grow">
              <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-semibold">{department.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1 h-10 overflow-hidden">
                        {department.description}
                    </p>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onDelete(department)} className="text-red-600">
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
              </div>
          </CardContent>
          <CardFooter className="bg-muted/30 px-4 py-3 flex items-center justify-between">
               <div className="flex items-center">
                  <div className="flex -space-x-2">
                      {department.doctors && department.doctors.slice(0, 3).map((doctorName, index) => (
                          <Image
                              key={index}
                              src={getDoctorAvatar(doctorName)}
                              alt={doctorName}
                              width={32}
                              height={32}
                              className="rounded-full border-2 border-white object-cover"
                              data-ai-hint="doctor portrait"
                          />
                      ))}
                  </div>
                  {department.doctors && department.doctors.length > 3 && (
                      <span className="text-xs text-muted-foreground ml-2">
                          + {department.doctors.length - 3} others
                      </span>
                  )}
              </div>
               <Button variant="link" className="p-0 h-auto" onClick={() => onSeeDetail(department)}>See Doctors</Button>
          </CardFooter>
      </Card>
  );

  const handleSaveDepartments = async (selectedDepts: Department[]) => {
    try {
        const promises = selectedDepts.map(dept => {
            const deptRef = doc(db, "departments", dept.id);
            return setDoc(deptRef, dept, { merge: true });
        });
        
        await Promise.all(promises);

        const departmentsCollection = collection(db, "departments");
        const departmentsSnapshot = await getDocs(departmentsCollection);
        const departmentsList = departmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
        setDepartments(departmentsList);

        toast({
            title: "Departments Added",
            description: `${selectedDepts.length} department(s) have been successfully added/updated.`,
        });
    } catch (error) {
        console.error("Error saving departments:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to save departments. Please try again.",
        });
    }
  }

  const handleDeleteDepartment = async () => {
    if (!deletingDepartment) return;
    try {
      await deleteDoc(doc(db, "departments", deletingDepartment.id));
      setDepartments(prev => prev.filter(d => d.id !== deletingDepartment.id));
      toast({
        title: "Department Deleted",
        description: `${deletingDepartment.name} has been removed.`,
      });
    } catch (error) {
      console.error("Error deleting department:", error);
       toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete department. Please try again.",
      });
    } finally {
        setDeletingDepartment(null);
    }
  }
  
  const handleSeeDetail = (department: Department) => {
    setSelectedDepartment(department);
    setIsDoctorsDialogOpen(true);
  }


  return (
    <>
      <div className="flex flex-col">
        <DepartmentsHeader />
        <main className="flex-1 p-4 sm:p-6">
          <div className="flex justify-end mb-4">
              <Button onClick={() => setIsAddDepartmentOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Department
              </Button>
              <SelectDepartmentDialog
                  isOpen={isAddDepartmentOpen}
                  setIsOpen={setIsAddDepartmentOpen}
                  departments={superAdminDepartments}
                  onDepartmentsSelect={handleSaveDepartments}
              />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {departments.map((dept) => (
                  <DepartmentCard key={dept.id} department={dept} onSeeDetail={handleSeeDetail} onDelete={() => setDeletingDepartment(dept)} />
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
        {selectedDepartment && (
          <DepartmentDoctorsDialog
            isOpen={isDoctorsDialogOpen}
            setIsOpen={setIsDoctorsDialogOpen}
            department={selectedDepartment}
            allDoctors={doctors}
          />
        )}

        <AlertDialog open={!!deletingDepartment} onOpenChange={(open) => !open && setDeletingDepartment(null)}>
              <AlertDialogContent>
                  <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the {deletingDepartment?.name} department and remove its data from our servers.
                  </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteDepartment} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                  </AlertDialogFooter>
              </AlertDialogContent>
        </AlertDialog>

        <footer className="text-center text-sm text-muted-foreground p-4">
            Copyright &copy; 2024 Peterdraw &nbsp;&middot;&nbsp; Privacy Policy &nbsp;&middot;&nbsp; Term and conditions &nbsp;&middot;&nbsp; Contact
        </footer>
      </div>
    </>
  );
}
