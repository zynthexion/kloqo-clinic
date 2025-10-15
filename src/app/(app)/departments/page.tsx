
"use client";

import Image from "next/image";
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
  Search,
  Users,
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
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { SelectDepartmentDialog } from "@/components/onboarding/select-department-dialog";
import { useAuth } from "@/firebase";
import { DepartmentDoctorsDialog } from "@/components/departments/department-doctors-dialog";
import { Input } from "@/components/ui/input";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [departmentsPerPage, setDepartmentsPerPage] = useState(6);

  const filteredDepartments = useMemo(() => {
    return clinicDepartments.filter(department =>
      department.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [clinicDepartments, searchTerm]);

  const totalPages = Math.ceil(filteredDepartments.length / departmentsPerPage);
  const currentDepartments = filteredDepartments.slice(
    (currentPage - 1) * departmentsPerPage,
    currentPage * departmentsPerPage
  );

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

  const DepartmentCard = ({ department, onDelete }: { department: Department, onDelete: (department: Department) => void }) => {
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
                   <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => setViewingDoctorsDept(department)}>
                        <Users className="mr-1 h-3 w-3" />
                        See Doctors
                    </Button>
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
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static smh-auto sm:border-0 sm:bg-transparent sm:px-6">
            <h1 className="text-xl font-semibold md:text-2xl">Departments</h1>
            <div className="relative ml-auto flex-1 md:grow-0">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search departments..."
                    className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[320px]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
             <Button onClick={() => setIsAddDepartmentOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Department
              </Button>
        </header>
        <main className="flex-1 p-4 sm:p-6 flex flex-col">
          <div className="grid flex-grow grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {loading ? (
                 Array.from({ length: 6 }).map((_, i) => (
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
              ) : currentDepartments.length > 0 ? (
                  currentDepartments.map((dept) => (
                    <DepartmentCard key={dept.id} department={dept} onDelete={() => setDeletingDepartment(dept)} />
                ))
              ) : (
                <div className="col-span-full text-center py-12">
                  <p className="text-muted-foreground">{clinicDepartments.length > 0 ? 'No departments match your search.' : 'No departments have been added to this clinic yet.'}</p>
                </div>
              )}
          </div>
        </main>
         <footer className="flex items-center justify-between p-4 border-t bg-background">
            <div className="text-sm text-muted-foreground">
                Showing {Math.min((currentPage - 1) * departmentsPerPage + 1, filteredDepartments.length)} to {Math.min(currentPage * departmentsPerPage, filteredDepartments.length)} of {filteredDepartments.length} departments
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}>
                    Next
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </footer>

        <SelectDepartmentDialog
            isOpen={isAddDepartmentOpen}
            setIsOpen={setIsAddDepartmentOpen}
            departments={availableMasterDepartments}
            onDepartmentsSelect={handleSaveDepartments}
        />

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
