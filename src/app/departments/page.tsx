
"use client";

import Image from "next/image";
import { DepartmentsHeader } from "@/components/layout/header";
import { SidebarInset } from "@/components/ui/sidebar";
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
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Department, Doctor } from "@/lib/types";
import { AddDepartmentForm } from "@/components/departments/add-department-form";
import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc, doc, setDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { DepartmentDoctorsDialog } from "@/components/departments/department-doctors-dialog";
import { AppSidebar } from "@/components/layout/sidebar";


export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const { toast } = useToast();
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [isDoctorsDialogOpen, setIsDoctorsDialogOpen] = useState(false);

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

  const DepartmentCard = ({ department, onSeeDetail }: { department: Department, onSeeDetail: (department: Department) => void }) => (
      <Card className="overflow-hidden">
          <CardContent className="p-0">
              <div className="relative h-40 w-full">
                  <Image
                      src={department.image}
                      alt={department.name}
                      fill
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
                          {department.doctors && department.doctors.slice(0, 5).map((doctorName, index) => (
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
                      {department.doctors && department.doctors.length > 5 && (
                          <span className="text-xs text-muted-foreground ml-2">
                              + {department.doctors.length - 5} others
                          </span>
                      )}
                  </div>
              </div>
          </CardContent>
          <CardFooter className="bg-muted/30 px-4 py-3">
               <Button variant="link" className="ml-auto p-0 h-auto" onClick={() => onSeeDetail(department)}>See Detail</Button>
          </CardFooter>
      </Card>
  );

  const handleSaveDepartment = async (deptData: { name: string; description: string; imageFile?: File; id?: string }) => {
    try {
        let imageUrl = `https://picsum.photos/seed/new-dept-${new Date().getTime()}/600/400`;

        if (deptData.imageFile) {
            const storageRef = ref(storage, `department_images/${deptData.imageFile.name}`);
            const snapshot = await uploadBytes(storageRef, deptData.imageFile);
            imageUrl = await getDownloadURL(snapshot.ref);
        }

        const newDeptRef = doc(collection(db, "departments"));
        const newDepartmentData: Omit<Department, 'id'> = {
            name: deptData.name,
            description: deptData.description,
            image: imageUrl,
            imageHint: `${deptData.name.toLowerCase()} department`,
            doctors: [],
        };
        
        await setDoc(newDeptRef, newDepartmentData);
        
        const newDepartment: Department = { id: newDeptRef.id, ...newDepartmentData };
        setDepartments(prev => [...prev, newDepartment]);

        toast({
            title: "Department Added",
            description: `${deptData.name} has been successfully added.`,
        });
    } catch (error) {
        console.error("Error saving department:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to save department. Please try again.",
        });
    }
  }
  
  const handleSeeDetail = (department: Department) => {
    setSelectedDepartment(department);
    setIsDoctorsDialogOpen(true);
  }


  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <DepartmentsHeader />
        <main className="flex-1 p-4 sm:p-6">
          <div className="flex justify-end mb-4">
              <Button onClick={() => setIsAddDepartmentOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Department
              </Button>
              <AddDepartmentForm 
                  onSave={handleSaveDepartment}
                  isOpen={isAddDepartmentOpen}
                  setIsOpen={setIsAddDepartmentOpen}
                  department={null}
              />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {departments.map((dept) => (
                  <DepartmentCard key={dept.id} department={dept} onSeeDetail={handleSeeDetail} />
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
        <footer className="text-center text-sm text-muted-foreground p-4">
            Copyright &copy; 2024 Peterdraw &nbsp;&middot;&nbsp; Privacy Policy &nbsp;&middot;&nbsp; Term and conditions &nbsp;&middot;&nbsp; Contact
        </footer>
      </SidebarInset>
    </>
  );
}
