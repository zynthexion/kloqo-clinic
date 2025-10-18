
"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ProfileHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { collection, getDocs, setDoc, doc, query, where, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { MobileApp, User, Appointment, TimeSlot } from "@/lib/types";
import { Eye, EyeOff, UserCircle, KeyRound, Edit, Save, X, Building, Loader2, Clock, PlusCircle, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/firebase";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const mobileAppFormSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});
type MobileAppFormValues = z.infer<typeof mobileAppFormSchema>;

const passwordFormSchema = z.object({
    currentPassword: z.string().min(1, "Please enter your current password."),
    newPassword: z.string().min(6, "New password must be at least 6 characters."),
    confirmPassword: z.string().min(6, "Please confirm your new password."),
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
});
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

const profileFormSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    phone: z.string().min(10, "Phone number must be at least 10 digits."),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

const clinicFormSchema = z.object({
    clinicName: z.string().min(2, "Clinic name must be at least 2 characters."),
    clinicType: z.enum(['Single Doctor', 'Multi-Doctor']),
    numDoctors: z.coerce.number().min(1),
    clinicRegNumber: z.string().optional(),
    mapsLink: z.string().url().optional().or(z.literal('')),
});
type ClinicFormValues = z.infer<typeof clinicFormSchema>;

const operatingHoursTimeSlotSchema = z.object({
  open: z.string().min(1, 'Required'),
  close: z.string().min(1, 'Required'),
});

const operatingHoursDaySchema = z.object({
  day: z.string(),
  timeSlots: z.array(operatingHoursTimeSlotSchema),
  isClosed: z.boolean(),
});

const operatingHoursFormSchema = z.object({
  hours: z.array(operatingHoursDaySchema),
});
type OperatingHoursFormValues = z.infer<typeof operatingHoursFormSchema>;


export default function ProfilePage() {
  const auth = useAuth();
  const [activeView, setActiveView] = useState("profile");
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<MobileApp | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [clinicDetails, setClinicDetails] = useState<any | null>(null);
  
  const [showPassword, setShowPassword] = useState(false);
  const [showSavedPassword, setShowSavedPassword] = useState(false);
  const [isEditingMobile, setIsEditingMobile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingClinic, setIsEditingClinic] = useState(false);
  const [isEditingHours, setIsEditingHours] = useState(false);
  
  const { toast } = useToast();

  const mobileAppForm = useForm<MobileAppFormValues>({ resolver: zodResolver(mobileAppFormSchema), defaultValues: { username: "", password: "" } });
  const passwordForm = useForm<PasswordFormValues>({ resolver: zodResolver(passwordFormSchema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });
  const profileForm = useForm<ProfileFormValues>({ resolver: zodResolver(profileFormSchema), defaultValues: { name: "", phone: "" } });
  const clinicForm = useForm<ClinicFormValues>({ 
      resolver: zodResolver(clinicFormSchema), 
      defaultValues: { clinicName: "", clinicType: "Single Doctor", numDoctors: 1 } 
  });
  const hoursForm = useForm<OperatingHoursFormValues>({
    resolver: zodResolver(operatingHoursFormSchema),
    defaultValues: { hours: [] }
  });

  const { fields, update } = useFieldArray({
    control: hoursForm.control,
    name: "hours",
  });


  useEffect(() => {
    if (!auth.currentUser) {
        setLoading(false);
        return;
    }

    const fetchAllData = async () => {
      setLoading(true);
      const userDocRef = doc(db, "users", auth.currentUser!.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as User;
          setUserProfile(userData);
          profileForm.reset({
              name: userData.name,
              phone: userData.phone,
          });

          if(userData.clinicId) {
            const clinicDocRef = doc(db, "clinics", userData.clinicId);
            const clinicDocSnap = await getDoc(clinicDocRef);
            if (clinicDocSnap.exists()) {
                const clinicData = clinicDocSnap.data();
                setClinicDetails(clinicData);
                clinicForm.reset({
                    clinicName: clinicData.name,
                    clinicType: clinicData.type,
                    numDoctors: clinicData.numDoctors,
                    clinicRegNumber: clinicData.clinicRegNumber,
                    mapsLink: clinicData.mapsLink,
                });
                hoursForm.reset({
                    hours: clinicData.operatingHours,
                });
            }

            const credsQuery = query(collection(db, "mobile-app"), where("clinicId", "==", userData.clinicId));
            const credsSnapshot = await getDocs(credsQuery);
            if (!credsSnapshot.empty) {
                const credsData = credsSnapshot.docs[0].data() as MobileApp;
                setCredentials({ ...credsData, id: credsSnapshot.docs[0].id });
                mobileAppForm.reset({ username: credsData.username, password: "" });
                setIsEditingMobile(false);
            } else {
                setIsEditingMobile(true);
            }
          }
      } else {
          setIsEditingMobile(true);
      }

      setLoading(false);
    };
    fetchAllData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.currentUser]);

  const onMobileAppSubmit = async (values: MobileAppFormValues) => {
    if (!userProfile?.clinicId) {
        toast({ variant: "destructive", title: "Error", description: "No clinic associated with this user."});
        return;
    }
    
    startTransition(async () => {
        try {
          const docId = credentials?.id || `creds-${userProfile.clinicId}`;
          const docRef = doc(db, "mobile-app", docId);
          
          const dataToSave: MobileApp = { id: docId, clinicId: userProfile.clinicId, username: values.username, password: values.password };
    
          await setDoc(docRef, dataToSave, { merge: true });
    
          setCredentials(dataToSave);
          mobileAppForm.reset({ username: values.username, password: "" });
          setIsEditingMobile(false);
          setShowSavedPassword(false);
          toast({ title: "Credentials Saved", description: "Mobile app credentials have been updated successfully." });
        } catch (error) {
          console.error("Error saving credentials:", error);
          toast({ variant: "destructive", title: "Error", description: "Failed to save credentials. Please try again." });
        }
    });
  };

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    if (!auth.currentUser || !auth.currentUser.email) return;

    startTransition(async () => {
        const credential = EmailAuthProvider.credential(auth.currentUser!.email!, values.currentPassword);
        try {
            await reauthenticateWithCredential(auth.currentUser!, credential);
            await updatePassword(auth.currentUser!, values.newPassword);
            toast({ title: "Password Updated", description: "Your password has been changed successfully." });
            passwordForm.reset();
        } catch (error: any) {
            console.error("Password update error:", error);
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: error.code === 'auth/wrong-password' 
                    ? "Incorrect current password. Please try again."
                    : "Failed to update password. Please try again later.",
            });
        }
    });
  }

  const onProfileSubmit = async (values: ProfileFormValues) => {
      if (!auth.currentUser) return;
      
      startTransition(async () => {
          const userRef = doc(db, 'users', auth.currentUser!.uid);
          try {
              await updateDoc(userRef, { name: values.name, phone: values.phone });
              setUserProfile(prev => prev ? {...prev, ...values} : null);
              toast({ title: "Profile Updated", description: "Your personal information has been changed successfully." });
              setIsEditingProfile(false);
          } catch (error) {
              console.error(error);
              toast({ variant: "destructive", title: "Update Failed", description: "Could not update your profile." });
          }
      });
  }
  
  const onClinicSubmit = async (values: ClinicFormValues) => {
    if (!userProfile?.clinicId) return;

    startTransition(async () => {
        const clinicRef = doc(db, 'clinics', userProfile.clinicId!);
        try {
            await updateDoc(clinicRef, { 
                name: values.clinicName,
                type: values.clinicType,
                numDoctors: values.numDoctors,
                clinicRegNumber: values.clinicRegNumber,
                mapsLink: values.mapsLink,
            });
            setClinicDetails(prev => prev ? {...prev, name: values.clinicName, type: values.clinicType, numDoctors: values.numDoctors, clinicRegNumber: values.clinicRegNumber, mapsLink: values.mapsLink } : null);
            toast({ title: "Clinic Details Updated", description: "Your clinic's information has been changed successfully." });
            setIsEditingClinic(false);
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Update Failed", description: "Could not update clinic details." });
        }
    });
  }

  const onHoursSubmit = async (values: OperatingHoursFormValues) => {
    if (!userProfile?.clinicId) return;
    
    startTransition(async () => {
        const clinicRef = doc(db, 'clinics', userProfile.clinicId!);
        try {
            await updateDoc(clinicRef, { operatingHours: values.hours });
            setClinicDetails(prev => (prev ? { ...prev, operatingHours: values.hours } : null));
            toast({ title: "Operating Hours Updated", description: "Clinic operating hours have been saved." });
            setIsEditingHours(false);
        } catch (error) {
            console.error("Error updating hours: ", error);
            toast({ variant: "destructive", title: "Update Failed", description: "Could not save operating hours." });
        }
    });
  };

  const handleCancelMobile = () => { if (credentials) { mobileAppForm.reset({ username: credentials.username, password: "" }); setIsEditingMobile(false); } }
  const handleCancelProfile = () => { if (userProfile) { profileForm.reset({ name: userProfile.name, phone: userProfile.phone }); } setIsEditingProfile(false); }
  const handleCancelClinic = () => { 
    if (clinicDetails) { 
        clinicForm.reset({ 
            clinicName: clinicDetails.name,
            clinicType: clinicDetails.type,
            numDoctors: clinicDetails.numDoctors,
            clinicRegNumber: clinicDetails.clinicRegNumber,
            mapsLink: clinicDetails.mapsLink,
        }); 
    } 
    setIsEditingClinic(false); 
  }

  const handleCancelHours = () => {
    if (clinicDetails?.operatingHours) {
        hoursForm.reset({ hours: clinicDetails.operatingHours });
    }
    setIsEditingHours(false);
  }

  const handleTimeChange = (dayIndex: number, slotIndex: number, field: 'open' | 'close', value: string) => {
    const day = fields[dayIndex];
    const newTimeSlots = [...day.timeSlots];
    newTimeSlots[slotIndex][field] = value;
    update(dayIndex, { ...day, timeSlots: newTimeSlots });
  };
  
  const addTimeSlot = (dayIndex: number) => {
    const day = fields[dayIndex];
    const newTimeSlots = [...day.timeSlots, { open: '14:00', close: '18:00' }];
    update(dayIndex, { ...day, timeSlots: newTimeSlots });
  };
  
  const removeTimeSlot = (dayIndex: number, slotIndex: number) => {
    const day = fields[dayIndex];
    const newTimeSlots = day.timeSlots.filter((_, index) => index !== slotIndex);
    update(dayIndex, { ...day, timeSlots: newTimeSlots });
  };

  const handleClosedToggle = (dayIndex: number, isClosed: boolean) => {
    const day = fields[dayIndex];
    update(dayIndex, { ...day, isClosed });
  };


  const renderContent = () => {
      switch(activeView) {
          case 'profile':
              return (
                  <Card>
                      <CardHeader>
                          <div className="flex items-center justify-between">
                              <CardTitle>Login & Personal Information</CardTitle>
                              {!isEditingProfile && (
                                  <Button variant="outline" size="icon" onClick={() => setIsEditingProfile(true)} disabled={isPending}>
                                      <Edit className="w-4 h-4"/>
                                  </Button>
                              )}
                          </div>
                          <CardDescription>Your personal and login information.</CardDescription>
                      </CardHeader>
                       <Form {...profileForm}>
                          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
                              <CardContent className="space-y-4">
                                  <FormField control={profileForm.control} name="name" render={({ field }) => (
                                      <FormItem><FormLabel>Admin Name</FormLabel><FormControl><Input {...field} disabled={!isEditingProfile || isPending} /></FormControl><FormMessage /></FormItem>
                                  )}/>
                                  <FormItem><FormLabel>Email Address</FormLabel><Input type="email" value={userProfile?.email || ""} disabled /></FormItem>
                                  <FormField control={profileForm.control} name="phone" render={({ field }) => (
                                      <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} disabled={!isEditingProfile || isPending} /></FormControl><FormMessage /></FormItem>
                                  )}/>
                                  {isEditingProfile && (
                                      <div className="flex justify-end gap-2 pt-4">
                                          <Button type="button" variant="ghost" onClick={handleCancelProfile} disabled={isPending}>Cancel</Button>
                                          <Button type="submit" disabled={isPending}>
                                              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                              Save Changes
                                          </Button>
                                      </div>
                                  )}
                              </CardContent>
                          </form>
                      </Form>
                      <Separator />
                      <CardFooter className="pt-6">
                          <Form {...passwordForm}>
                              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="w-full space-y-4">
                                  <p className="font-medium text-sm">Change Password</p>
                                  <FormField control={passwordForm.control} name="currentPassword" render={({ field }) => (
                                      <FormItem><FormLabel>Current Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                                  )}/>
                                  <FormField control={passwordForm.control} name="newPassword" render={({ field }) => (
                                      <FormItem><FormLabel>New Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                                  )}/>
                                  <FormField control={passwordForm.control} name="confirmPassword" render={({ field }) => (
                                      <FormItem><FormLabel>Confirm New Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                                  )}/>
                                  <Button type="submit" variant="secondary" className="w-full" disabled={isPending}>
                                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                    Set New Password
                                  </Button>
                              </form>
                          </Form>
                      </CardFooter>
                  </Card>
              );
          case 'clinic':
              return (
                   <Card>
                      <CardHeader>
                          <div className="flex items-center justify-between">
                              <CardTitle>General Information</CardTitle>
                              {!isEditingClinic && (
                                  <Button variant="outline" size="icon" onClick={() => setIsEditingClinic(true)} disabled={isPending}>
                                      <Edit className="w-4 h-4"/>
                                  </Button>
                              )}
                          </div>
                          <CardDescription>General information about your clinic.</CardDescription>
                      </CardHeader>
                      <Form {...clinicForm}>
                          <form onSubmit={clinicForm.handleSubmit(onClinicSubmit)}>
                              <CardContent className="space-y-4">
                                  <FormField control={clinicForm.control} name="clinicName" render={({ field }) => (
                                      <FormItem><FormLabel>Clinic Name</FormLabel><FormControl><Input {...field} disabled={!isEditingClinic || isPending} /></FormControl><FormMessage /></FormItem>
                                  )}/>
                                  <FormField control={clinicForm.control} name="clinicType" render={({ field }) => (
                                      <FormItem><FormLabel>Clinic Type</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value} disabled={!isEditingClinic || isPending}>
                                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                          <SelectContent>
                                              <SelectItem value="Single Doctor">Single Doctor</SelectItem>
                                              <SelectItem value="Multi-Doctor">Multi-Doctor</SelectItem>
                                          </SelectContent>
                                      </Select>
                                      <FormMessage /></FormItem>
                                  )}/>
                                  <FormItem>
                                      <FormLabel>Doctor Count</FormLabel>
                                      <div className="flex items-center gap-4">
                                          <div className="flex items-center gap-2">
                                              <div className="text-2xl font-bold text-primary">
                                                  {clinicDetails?.currentDoctorCount || 0}
                                              </div>
                                              <div className="text-sm text-muted-foreground">
                                                  of {clinicDetails?.maxDoctors || 0} doctors
                                              </div>
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                              {clinicDetails?.maxDoctors && clinicDetails?.currentDoctorCount ?
                                                  `${Math.round((clinicDetails.currentDoctorCount / clinicDetails.maxDoctors) * 100)}% utilized` :
                                                  'No limit set'
                                              }
                                          </div>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1">
                                          Current doctors registered vs. maximum allowed by your plan.
                                      </p>
                                  </FormItem>
                                  <FormField control={clinicForm.control} name="clinicRegNumber" render={({ field }) => (
                                      <FormItem><FormLabel>Clinic Registration Number</FormLabel><FormControl><Input {...field} disabled={!isEditingClinic || isPending} /></FormControl><FormMessage /></FormItem>
                                  )}/>
                                  <FormItem>
                                      <FormLabel>Address</FormLabel>
                                      <Input value={clinicDetails?.address || "Not set"} disabled />
                                  </FormItem>
                                  <FormField control={clinicForm.control} name="mapsLink" render={({ field }) => (
                                      <FormItem><FormLabel>Google Maps Link</FormLabel><FormControl><Input {...field} disabled={!isEditingClinic || isPending} /></FormControl><FormMessage /></FormItem>
                                  )}/>
                                  <FormItem>
                                      <FormLabel>Plan</FormLabel>
                                      <div><Badge>{clinicDetails?.plan || "Not set"}</Badge></div>
                                  </FormItem>

                                  {isEditingClinic && (
                                      <div className="flex justify-end gap-2 pt-4">
                                          <Button type="button" variant="ghost" onClick={handleCancelClinic} disabled={isPending}>Cancel</Button>
                                          <Button type="submit" disabled={isPending}>
                                              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                              Save Changes
                                          </Button>
                                      </div>
                                  )}
                              </CardContent>
                          </form>
                      </Form>
                  </Card>
              );
          case 'hours':
            return (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Operating Hours</CardTitle>
                    {!isEditingHours && (
                        <Button variant="outline" size="icon" onClick={() => setIsEditingHours(true)} disabled={isPending}>
                            <Edit className="w-4 h-4"/>
                        </Button>
                    )}
                  </div>
                  <CardDescription>Manage your clinic's weekly schedule.</CardDescription>
                </CardHeader>
                <Form {...hoursForm}>
                  <form onSubmit={hoursForm.handleSubmit(onHoursSubmit)}>
                    <CardContent className="space-y-4">
                      {fields.map((hour, dayIndex) => (
                        <div key={hour.id} className={cn("p-4 border rounded-lg", hour.isClosed && isEditingHours && "bg-muted/50")}>
                          <div className="flex items-center justify-between mb-4">
                            <p className={cn("w-24 font-semibold", hour.isClosed && isEditingHours && "text-muted-foreground")}>{hour.day}</p>
                            {isEditingHours && (
                              <div className="flex items-center space-x-2">
                                <Label htmlFor={`closed-switch-${dayIndex}`}>{hour.isClosed ? 'Closed' : 'Open'}</Label>
                                <Switch
                                  id={`closed-switch-${dayIndex}`}
                                  checked={!hour.isClosed}
                                  onCheckedChange={(checked) => handleClosedToggle(dayIndex, !checked)}
                                />
                              </div>
                            )}
                          </div>

                          {!hour.isClosed && (
                            <div className="space-y-3">
                              {hour.timeSlots.map((slot, slotIndex) => (
                                <div key={slotIndex} className="flex items-end gap-2">
                                  <div className="space-y-1 flex-grow">
                                    <Label htmlFor={`open-time-${dayIndex}-${slotIndex}`} className="text-xs">Open</Label>
                                    <Input
                                      id={`open-time-${dayIndex}-${slotIndex}`}
                                      type="time"
                                      defaultValue={slot.open}
                                      onChange={e => handleTimeChange(dayIndex, slotIndex, 'open', e.target.value)}
                                      disabled={!isEditingHours || isPending}
                                    />
                                  </div>
                                  <div className="space-y-1 flex-grow">
                                    <Label htmlFor={`close-time-${dayIndex}-${slotIndex}`} className="text-xs">Close</Label>
                                    <Input
                                      id={`close-time-${dayIndex}-${slotIndex}`}
                                      type="time"
                                      defaultValue={slot.close}
                                      onChange={e => handleTimeChange(dayIndex, slotIndex, 'close', e.target.value)}
                                      disabled={!isEditingHours || isPending}
                                    />
                                  </div>
                                  {isEditingHours && (
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => removeTimeSlot(dayIndex, slotIndex)}
                                      disabled={hour.timeSlots.length <= 1 || isPending}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                              {isEditingHours && (
                                <Button type="button" variant="link" size="sm" onClick={() => addTimeSlot(dayIndex)} className="text-primary" disabled={isPending}>
                                  <PlusCircle className="mr-2 h-4 w-4" /> Add Slot
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                    {isEditingHours && (
                        <CardFooter className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={handleCancelHours} disabled={isPending}>Cancel</Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
                                Save Hours
                            </Button>
                        </CardFooter>
                    )}
                  </form>
                </Form>
              </Card>
            );
          case 'mobile':
               return (
                  <Card>
                      {loading ? (
                          <CardHeader><CardTitle>Loading...</CardTitle></CardHeader>
                      ) : isEditingMobile || !credentials ? (
                          <>
                          <CardHeader>
                          <CardTitle>{credentials ? "Update Mobile App Login" : "Set Mobile App Login"}</CardTitle>
                          <CardDescription>Set or update the username and password for the mobile token management app.</CardDescription>
                          </CardHeader>
                          <Form {...mobileAppForm}>
                          <form onSubmit={mobileAppForm.handleSubmit(onMobileAppSubmit)}>
                              <CardContent className="space-y-4">
                              <FormField control={mobileAppForm.control} name="username" render={({ field }) => (
                                  <FormItem><FormLabel>Username</FormLabel><FormControl><Input placeholder="mobile-user" {...field} disabled={isPending} /></FormControl><FormMessage /></FormItem>
                              )}/>
                              <FormField control={mobileAppForm.control} name="password" render={({ field }) => (
                                  <FormItem>
                                      <FormLabel>{credentials ? "New Password" : "Password"}</FormLabel>
                                      <div className="relative">
                                      <FormControl>
                                          <Input type={showPassword ? "text" : "password"} placeholder="••••••••" {...field} className="pr-10" disabled={isPending}/>
                                      </FormControl>
                                      <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                      </Button>
                                      </div>
                                      <FormMessage />
                                  </FormItem>
                              )}/>
                              </CardContent>
                              <CardFooter className="flex justify-end gap-2">
                              {credentials && <Button type="button" variant="outline" onClick={handleCancelMobile} disabled={isPending}>Cancel</Button>}
                              <Button type="submit" disabled={isPending}>
                                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : "Save Credentials"}
                              </Button>
                              </CardFooter>
                          </form>
                          </Form>
                          </>
                      ) : (
                          <>
                          <CardHeader>
                              <CardTitle>Mobile App Credentials</CardTitle>
                              <CardDescription>This is the login information for the mobile token management app.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                              <div className="flex items-center gap-4 rounded-lg border p-4 bg-muted/40">
                                  <UserCircle className="h-10 w-10 text-muted-foreground" />
                                  <div><p className="text-sm text-muted-foreground">Username</p><p className="text-lg font-semibold">{credentials.username}</p></div>
                              </div>
                              <div className="flex items-center gap-4 rounded-lg border p-4 bg-muted/40">
                                  <KeyRound className="h-10 w-10 text-muted-foreground" />
                                  <div><p className="text-sm text-muted-foreground">Password</p><p className="text-lg font-semibold">{showSavedPassword ? credentials.password : "••••••••"}</p></div>
                              </div>
                              <CardDescription className="text-xs text-center">The password shown is the last one saved to the database.</CardDescription>
                          </CardContent>
                          <CardFooter className="flex justify-end gap-2">
                              <Button variant="secondary" onClick={() => setShowSavedPassword(prev => !prev)}>
                                  {showSavedPassword ? <EyeOff className="mr-2"/> : <Eye className="mr-2"/>}
                                  {showSavedPassword ? 'Hide' : 'Reveal'} Password
                              </Button>
                              <Button onClick={() => setIsEditingMobile(true)}>Update Credentials</Button>
                          </CardFooter>
                          </>
                      )}
                  </Card>
              );
          default:
              return null;
      }
  }

  return (
    <>
      <div>
        <ProfileHeader />
        <main className="flex-1 p-6 bg-background">
          <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-6 items-start">
            <div className="md:col-span-1">
                <Card>
                    <CardContent className="p-2">
                        <nav className="flex flex-col gap-1">
                            <Button variant={activeView === 'profile' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setActiveView('profile')}>
                                <UserCircle className="mr-2 h-4 w-4"/>
                                Your Profile
                            </Button>
                            <Button variant={activeView === 'clinic' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setActiveView('clinic')}>
                                <Building className="mr-2 h-4 w-4"/>
                                Clinic Details
                            </Button>
                            <Button variant={activeView === 'hours' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setActiveView('hours')}>
                                <Clock className="mr-2 h-4 w-4"/>
                                Operating Hours
                            </Button>
                            <Button variant={activeView === 'mobile' ? 'secondary' : 'ghost'} className="w-full justify-start" onClick={() => setActiveView('mobile')}>
                                <KeyRound className="mr-2 h-4 w-4"/>
                                Mobile App
                            </Button>
                        </nav>
                    </CardContent>
                </Card>
            </div>
            <div className="md:col-span-3">
              {renderContent()}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

    