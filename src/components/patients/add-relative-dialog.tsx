

"use client";

import { useState, useTransition } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { doc, setDoc, updateDoc, arrayUnion, collection, writeBatch, getDocs, query, where, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Patient, User } from "@/lib/types";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  age: z.coerce.number().min(0, "Age cannot be negative."),
  sex: z.enum(["Male", "Female", "Other"]),
  phone: z.string().optional(),
  place: z.string().min(2, "Place is required."),
});

type AddRelativeFormValues = z.infer<typeof formSchema>;

type AddRelativeDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  primaryMemberId: string;
  onRelativeAdded: (newRelative: Patient) => void;
};

export function AddRelativeDialog({
  isOpen,
  setIsOpen,
  primaryMemberId,
  onRelativeAdded,
}: AddRelativeDialogProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<AddRelativeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      age: 0,
      sex: "Male",
      phone: "",
      place: "",
    },
  });

  const onSubmit = (values: AddRelativeFormValues) => {
    startTransition(async () => {
      try {
        const batch = writeBatch(db);
        const newRelativePatientRef = doc(collection(db, "patients"));
        const primaryMemberRef = doc(db, "patients", primaryMemberId);

        const primaryMemberSnap = await getDoc(primaryMemberRef);
        if (!primaryMemberSnap.exists()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Primary member not found.'});
            return;
        }
        const primaryMemberData = primaryMemberSnap.data() as Patient;
        const primaryMemberPhone = primaryMemberData.communicationPhone;

        const relativePhone = values.phone ? `+91${values.phone}` : "";
        let newRelativeData: Patient;

        if (relativePhone) {
          const usersRef = collection(db, "users");
          const userQuery = query(usersRef, where("phone", "==", relativePhone));
          const userSnapshot = await getDocs(userQuery);

          if (!userSnapshot.empty) {
            toast({
              variant: "destructive",
              title: "Phone Number In Use",
              description: "This phone number is already registered to another user.",
            });
            return;
          }
          
          const newUserRef = doc(collection(db, 'users'));
          const newUserData: User = {
            uid: newUserRef.id,
            phone: relativePhone,
            role: 'patient',
            patientId: newRelativePatientRef.id
          };
          batch.set(newUserRef, newUserData);

          newRelativeData = {
            id: newRelativePatientRef.id,
            primaryUserId: newUserRef.id,
            name: values.name,
            age: values.age,
            sex: values.sex,
            phone: relativePhone,
            communicationPhone: relativePhone,
            place: values.place,
            totalAppointments: 0,
            visitHistory: [],
            relatedPatientIds: [primaryMemberId],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

        } else {
            newRelativeData = {
              id: newRelativePatientRef.id,
              name: values.name,
              age: values.age,
              sex: values.sex,
              phone: "", // Phone is empty
              communicationPhone: primaryMemberPhone, // Main user's phone
              place: values.place,
              totalAppointments: 0,
              visitHistory: [],
              relatedPatientIds: [primaryMemberId],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
        }

        batch.set(newRelativePatientRef, newRelativeData);
        batch.update(primaryMemberRef, {
          relatedPatientIds: arrayUnion(newRelativePatientRef.id),
        });

        await batch.commit();
        
        onRelativeAdded(newRelativeData);

        toast({
          title: "Relative Added",
          description: `${values.name} has been added to the family.`,
        });
        setIsOpen(false);
        form.reset();
      } catch (error) {
        console.error("Error adding relative:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to add relative. Please try again.",
        });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Relative</DialogTitle>
          <DialogDescription>
            Enter the details for the new family member.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <div className="grid grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="Enter age" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="sex"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
            </div>
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number (Optional)</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="Enter 10-digit number" {...field} />
                  </FormControl>
                   <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="place"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Place</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter city or town" {...field} />
                  </FormControl>
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
                Save Relative
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
