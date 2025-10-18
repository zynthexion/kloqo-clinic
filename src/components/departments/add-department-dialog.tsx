
"use client";

import * as React from "react";
import { useState, useTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { doc, setDoc, collection, getDoc, getDocs, query, where, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Department } from "@/lib/types";
import { useAuth } from "@/firebase";
import * as Lucide from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

const iconNames = [
  "Stethoscope", "HeartPulse", "Baby", "Sparkles", "BrainCircuit", "Bone",
  "Award", "Droplets", "Filter", "Droplet", "Eye", "Ear", "Brain",
  "PersonStanding", "Radiation", "Siren", "Microwave", "TestTube", "Bug",
  "Scissors", "Ambulance", "Wind", "Virus", "Activity", "Pill"
];


const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  description: z.string().min(10, "Description must be at least 10 characters."),
  icon: z.string().min(1, "Please select an icon."),
});

type AddDepartmentFormValues = z.infer<typeof formSchema>;

type AddDepartmentDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onDepartmentAdded: (newDepartment: Department) => void;
};

export function AddDepartmentDialog({
  isOpen,
  setIsOpen,
  onDepartmentAdded,
}: AddDepartmentDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [departmentLimitReached, setDepartmentLimitReached] = useState(false);
  const [clinicDetails, setClinicDetails] = useState<any>(null);
  const [currentDeptCount, setCurrentDeptCount] = useState(0);

  const { toast } = useToast();
  const auth = useAuth();

  const form = useForm<AddDepartmentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", icon: "Stethoscope" },
  });

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      const checkLimit = async () => {
        const userDocRef = doc(db, 'users', auth.currentUser!.uid);
        const userDocSnap = await getDoc(userDocRef);
        const clinicId = userDocSnap.data()?.clinicId;
        
        if (clinicId) {
            const clinicDocRef = doc(db, 'clinics', clinicId);
            const clinicDocSnap = await getDoc(clinicDocRef);
            if (clinicDocSnap.exists()) {
                const data = clinicDocSnap.data();
                setClinicDetails(data);
                const currentCount = data.departments?.length || 0;
                setCurrentDeptCount(currentCount);
                if (currentCount >= data.numDoctors) {
                    setDepartmentLimitReached(true);
                } else {
                    setDepartmentLimitReached(false);
                }
            }
        }
      };
      checkLimit();
    }
  }, [isOpen, auth.currentUser]);


  const onSubmit = (values: AddDepartmentFormValues) => {
    if (departmentLimitReached) return;

    startTransition(async () => {
      try {
        const newDeptId = `dept-${Date.now()}`;
        const deptRef = doc(db, "master-departments", newDeptId);

        const newDepartmentData: Omit<Department, "doctors"> & { doctors: [] } = {
          id: newDeptId,
          name: values.name,
          description: values.description,
          icon: values.icon,
          doctors: [],
        };
        
        await setDoc(deptRef, newDepartmentData);
        
        // Also add it to the clinic's list of departments
        if (auth.currentUser) {
            const userDocRef = doc(db, 'users', auth.currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);
            const clinicId = userDocSnap.data()?.clinicId;
            if (clinicId) {
                const clinicDocRef = doc(db, 'clinics', clinicId);
                await updateDoc(clinicDocRef, {
                    departments: arrayUnion(newDeptId)
                });
            }
        }
        
        onDepartmentAdded(newDepartmentData as Department);

        toast({
          title: "Department Added",
          description: `${values.name} has been created.`,
        });
        setIsOpen(false);
        form.reset();
      } catch (error) {
        console.error("Error adding department:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to add department. Please try again.",
        });
      }
    });
  };
  

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Department</DialogTitle>
          <DialogDescription>
            Create a new department for your clinic.
          </DialogDescription>
        </DialogHeader>

        {departmentLimitReached ? (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Department Limit Reached</AlertTitle>
                <AlertDescription>
                   Your clinic plan supports up to {clinicDetails?.numDoctors} departments. Please <Link href="/profile" className="underline font-bold">upgrade your plan</Link> to add more.
                </AlertDescription>
            </Alert>
        ) : (
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Department Name</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., General Surgery" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                        <Textarea placeholder="A brief description of the department." {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Icon</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an icon" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {iconNames.map(iconName => {
                            const IconComponent = Lucide[iconName as keyof typeof Lucide] as React.ElementType;
                            if (!IconComponent) return null;
                            return (
                              <SelectItem key={iconName} value={iconName}>
                                <div className="flex items-center gap-2">
                                  <IconComponent className="h-4 w-4" />
                                  <span>{iconName}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Department
                </Button>
                </DialogFooter>
            </form>
            </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
