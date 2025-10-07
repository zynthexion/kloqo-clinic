
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
import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { DepartmentDoctorsDialog } from "@/components/departments/department-doctors-dialog";
import { SelectDepartmentDialog } from "@/components/onboarding/select-department-dialog";
import { useAuth } from "@/firebase";

export default function DepartmentsPage() {
  const auth = useAuth();
  const [clinicDepartments, setClinicDepartments] = useState<Department[]>([]);
  const [masterDepartments, setMasterDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const { toast } = useToast();
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [isDoctorsDialogOpen, setIsDoctorsDialogOpen] = useState(false);
  const [deletingDepartment, setDeletingDepartment] = useState<Department | null>(null);

  const fetchClinicData = useCallback(async () => {
    if (!auth.currentUser) return;
    
    const userDoc = await getDoc(doc(db, "users", auth.currentUser!.uid));
    const clinicId = userDoc.data()?.clinicId;

    if (clinicId) {
        // Fetch all doctors for the clinic
        const doctorsSnapshot = await getDocs(collection(db, "clinics", clinicId, "doctors"));
        const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);

        // Fetch master departments
        const masterDeptsSnapshot = await getDocs(collection(db, "master-departments"));
        const masterDeptsList = masterDeptsSnapshot.docs.map(d => d.data() as Department);
        setMasterDepartments(masterDeptsList);
        
        // Fetch clinic document to get the array of department names
        const clinicDoc = await getDoc(doc(db, "clinics", clinicId));
        if (clinicDoc.exists()) {
            const clinicData = clinicDoc.data();
            const departmentNames: string[] = clinicData.departments || [];
            
            // Filter master list to get full department objects for the clinic
            const deptsForClinic = masterDeptsList.filter(masterDept => departmentNames.includes(masterDept.name));
            setClinicDepartments(deptsForClinic);
        }
    }
  }, [auth.currentUser]);

  useEffect(() => {
    fetchClinicData();
  }, [fetchClinicData]);

  const getDoctorAvatar = (doctorName: string) => {
    const doctor = doctors.find((d) => d.name === doctorName);
    return doctor ? doctor.avatar : "https://picsum.photos/seed/generic-doctor/100/100";
  }

  const getDoctorsInDepartment = (departmentName: string) => {
    return doctors.filter(doctor => doctor.department === departmentName).map(d => d.name);
  }

  const DepartmentCard = ({ department, onSeeDetail, onDelete }: { department: Department, onSeeDetail: (department: Department) => void, onDelete: (department: Department) => void }) => {
      const doctorsInDept = getDoctorsInDepartment(department.name);
      return (
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
                          {doctorsInDept.slice(0, 3).map((doctorName, index) => (
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
                      {doctorsInDept.length > 3 && (
                          <span className="text-xs text-muted-foreground ml-2">
                              + {doctorsInDept.length - 3} others
                          </span>
                      )}
                  </div>
                   <Button variant="link" className="p-0 h-auto" onClick={() => onSeeDetail(department)}>See Doctors</Button>
              </CardFooter>
          </Card>
      );
  }

  const handleSaveDepartments = async (selectedDepts: Department[]) => {
    if (!auth.currentUser) return;
    try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const clinicId = userDoc.data()?.clinicId;
        if (!clinicId) throw new Error("User has no clinic assigned.");

        const clinicRef = doc(db, "clinics", clinicId);
        const departmentNamesToAdd = selectedDepts.map(d => d.name);

        await updateDoc(clinicRef, {
            departments: arrayUnion(...departmentNamesToAdd)
        });

        fetchClinicData(); // Re-fetch all data to update the UI

        toast({
            title: "Departments Added",
            description: `${selectedDepts.length} department(s) have been successfully added.`,
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
    if (!deletingDepartment || !auth.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      const clinicId = userDoc.data()?.clinicId;
      if (!clinicId) throw new Error("User has no clinic assigned.");

      const clinicRef = doc(db, "clinics", clinicId);
      await updateDoc(clinicRef, {
        departments: arrayRemove(deletingDepartment.name)
      });
      
      setClinicDepartments(prev => prev.filter(d => d.id !== deletingDepartment.id));

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
    const doctorsInDept = doctors.filter(doc => doc.department === department.name);
    setSelectedDepartment({...department, doctors: doctorsInDept.map(d => d.name)});
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
                  departments={masterDepartments}
                  onDepartmentsSelect={handleSaveDepartments}
              />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {clinicDepartments.map((dept) => (
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
                  out of {clinicDepartments.length}
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
                      This action cannot be undone. This will permanently delete the {deletingDepartment?.name} department from your clinic.
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
