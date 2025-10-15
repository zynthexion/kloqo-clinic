
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
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { SelectDepartmentDialog } from "@/components/onboarding/select-department-dialog";
import { useAuth } from "@/firebase";
import { DepartmentDoctorsDialog } from "@/components/departments/department-doctors-dialog";

export default function DepartmentsPage() {
  const auth = useAuth();
  const [clinicDepartments, setClinicDepartments] = useState<Department[]>([]);
  const [masterDepartments, setMasterDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const { toast } = useToast();
  const [isAddDepartmentOpen, setIsAddDepartmentOpen] = useState(false);
  const [deletingDepartment, setDeletingDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingDoctorsDept, setViewingDoctorsDept] = useState<Department | null>(null);

  useEffect(() => {
    const fetchMasterDepartments = async () => {
      if (!auth.currentUser) return;
      try {
        const masterDeptsSnapshot = await getDocs(collection(db, "master-departments"));
        const masterDeptsList = masterDeptsSnapshot.docs.map(d => d.data() as Department);
        setMasterDepartments(masterDeptsList);
      } catch (error) {
        console.error("Error fetching master departments:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load master department list." });
      }
    };
    fetchMasterDepartments();
  }, [auth.currentUser, toast]);

  const fetchClinicData = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      const clinicId = userDoc.data()?.clinicId;

      if (clinicId) {
        const clinicDoc = await getDoc(doc(db, "clinics", clinicId));
        if (clinicDoc.exists()) {
          const clinicData = clinicDoc.data();
          const departmentIds: string[] = clinicData.departments || [];

          if (departmentIds.length > 0) {
            const departmentPromises = departmentIds.map(id => getDoc(doc(db, 'master-departments', id)));
            const departmentSnapshots = await Promise.all(departmentPromises);
            const deptsForClinic = departmentSnapshots
              .filter(snap => snap.exists())
              .map(snap => snap.data() as Department);
            setClinicDepartments(deptsForClinic);
          } else {
            setClinicDepartments([]);
          }
        }
        const doctorsSnapshot = await getDocs(query(collection(db, "doctors"), where("clinicId", "==", clinicId)));
        const doctorsList = doctorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
        setDoctors(doctorsList);
      }
    } catch(error) {
        console.error("Error fetching departments data:", error);
        toast({ variant: "destructive", title: "Error", description: "Failed to load clinic-specific department data."});
    } finally {
        setLoading(false);
    }
  }, [auth.currentUser, toast]);

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

  const DepartmentCard = ({ department, onDelete, onViewDoctors }: { department: Department, onDelete: (department: Department) => void, onViewDoctors: (department: Department) => void }) => {
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
                  <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => onViewDoctors(department)}>See Doctors</Button>
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
        const departmentIdsToAdd = selectedDepts.map(d => d.id);
        
        await updateDoc(clinicRef, {
            departments: arrayUnion(...departmentIdsToAdd)
        });

        fetchClinicData();

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
        departments: arrayRemove(deletingDepartment.id)
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

  const availableMasterDepartments = masterDepartments.filter(
    (masterDept) => !clinicDepartments.some((clinicDept) => clinicDept.id === masterDept.id)
  );

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
                  departments={availableMasterDepartments}
                  onDepartmentsSelect={handleSaveDepartments}
              />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {loading ? (
                 Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="h-full flex flex-col animate-pulse">
                        <div className="h-40 w-full bg-muted"></div>
                        <CardContent className="p-4 flex-grow">
                            <div className="h-6 w-3/4 bg-muted rounded"></div>
                            <div className="h-10 w-full bg-muted rounded mt-2"></div>
                        </CardContent>
                        <CardFooter className="bg-muted/30 px-4 py-3 flex items-center justify-between">
                            <div className="h-8 w-1/2 bg-muted rounded"></div>
                            <div className="h-6 w-1/4 bg-muted rounded"></div>
                        </CardFooter>
                    </Card>
                 ))
              ) : clinicDepartments.length > 0 ? (
                  clinicDepartments.map((dept) => (
                    <DepartmentCard key={dept.id} department={dept} onDelete={() => setDeletingDepartment(dept)} onViewDoctors={setViewingDoctorsDept} />
                ))
              ) : (
                <div className="col-span-full text-center py-12">
                  <p className="text-muted-foreground">No departments have been added to this clinic yet.</p>
                </div>
              )}
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
            </div>
        </main>

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

        <DepartmentDoctorsDialog 
            isOpen={!!viewingDoctorsDept}
            setIsOpen={(isOpen) => !isOpen && setViewingDoctorsDept(null)}
            department={viewingDoctorsDept}
            allDoctors={doctors}
        />
      </div>
    </>
  );
}
