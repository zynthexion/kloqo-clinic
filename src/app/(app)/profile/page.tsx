
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
import { collection, getDocs, setDoc, doc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { MobileApp, User } from "@/lib/types";
import { Eye, EyeOff, UserCircle, KeyRound, Edit, Save, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/firebase";

const mobileAppFormSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

type MobileAppFormValues = z.infer<typeof mobileAppFormSchema>;

const passwordFormSchema = z.object({
    currentPassword: z.string().min(6, "Current password is required."),
    newPassword: z.string().min(6, "New password must be at least 6 characters."),
    confirmPassword: z.string().min(6, "Please confirm your new password."),
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

const profileFormSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    clinicName: z.string().min(2, "Clinic name must be at least 2 characters."),
    email: z.string().email("Please enter a valid email."),
    phone: z.string().min(10, "Phone number must be at least 10 digits."),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;


export default function ProfilePage() {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<MobileApp | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSavedPassword, setShowSavedPassword] = useState(false);
  const [isEditingMobile, setIsEditingMobile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const { toast } = useToast();

  const mobileAppForm = useForm<MobileAppFormValues>({
    resolver: zodResolver(mobileAppFormSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
      resolver: zodResolver(passwordFormSchema),
      defaultValues: {
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
      }
  });

    const profileForm = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            name: "",
            clinicName: "",
            email: "",
            phone: "",
        }
    });

  useEffect(() => {
    if (!auth.currentUser) {
        setLoading(false);
        return;
    }

    const fetchClinicData = async () => {
      setLoading(true);
      const userDocRef = doc(db, "users", auth.currentUser!.uid);
      const userDocSnap = await getDocs(query(collection(db, "users"), where("uid", "==", auth.currentUser!.uid)));

      if (!userDocSnap.empty) {
          const userData = userDocSnap.docs[0].data() as User;
          setUserProfile(userData);
          profileForm.reset({
              name: userData.name,
              clinicName: userData.clinicName,
              email: userData.email,
              phone: userData.phone,
          });

          if(userData.clinicId) {
            const credsQuery = query(collection(db, "mobile-app"), where("clinicId", "==", userData.clinicId));
            const credsSnapshot = await getDocs(credsQuery);
            if (!credsSnapshot.empty) {
                const credsData = credsSnapshot.docs[0].data() as MobileApp;
                setCredentials(credsData);
                mobileAppForm.reset({
                username: credsData.username,
                password: "", 
                });
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
    fetchClinicData();
  }, [auth.currentUser, mobileAppForm, profileForm]);

  const onMobileAppSubmit = async (values: MobileAppFormValues) => {
    if (!userProfile?.clinicId) {
        toast({ variant: "destructive", title: "Error", description: "No clinic associated with this user."});
        return;
    }

    try {
      const docId = credentials ? credentials.id : `creds-${userProfile.clinicId}`;
      const docRef = doc(db, "mobile-app", docId);
      
      const dataToSave: MobileApp = {
        id: docId,
        clinicId: userProfile.clinicId,
        username: values.username,
        password: values.password, // In a real app, this should be hashed!
      };

      await setDoc(docRef, dataToSave, { merge: true });

      setCredentials(dataToSave);
      mobileAppForm.reset({
          username: values.username,
          password: "",
      });
      setIsEditingMobile(false);
      setShowSavedPassword(false);

      toast({
        title: "Credentials Saved",
        description: "Mobile app credentials have been updated successfully.",
      });
    } catch (error) {
      console.error("Error saving credentials:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save credentials. Please try again.",
      });
    }
  };

  const onPasswordSubmit = (values: PasswordFormValues) => {
    console.log(values);
    // In a real app, you would handle password change logic here.
    toast({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
    });
    passwordForm.reset();
  }

  const onProfileSubmit = (values: ProfileFormValues) => {
      console.log(values);
       toast({
        title: "Profile Updated",
        description: "Your profile information has been changed successfully.",
    });
    setIsEditingProfile(false);
  }

  const handleCancelMobile = () => {
    if (credentials) {
        mobileAppForm.reset({
            username: credentials.username,
            password: "",
        });
        setIsEditingMobile(false);
    }
  }
  
  const handleCancelProfile = () => {
    if (userProfile) {
        profileForm.reset({
            name: userProfile.name,
            clinicName: userProfile.clinicName,
            email: userProfile.email,
            phone: userProfile.phone,
        });
    }
    setIsEditingProfile(false);
  }

  return (
    <>
      <div>
        <ProfileHeader />
        <main className="flex-1 p-6 bg-background">
          <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
             <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Your Profile</CardTitle>
                        {!isEditingProfile && (
                            <Button variant="outline" size="icon" onClick={() => setIsEditingProfile(true)}>
                                <Edit className="w-4 h-4"/>
                            </Button>
                        )}
                    </div>
                    <CardDescription>
                        This is your clinic's information.
                    </CardDescription>
                </CardHeader>
                 <Form {...profileForm}>
                    <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
                        <CardContent className="space-y-4">
                            <FormField
                                control={profileForm.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">Admin Name</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="Your Name" disabled={!isEditingProfile} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Separator/>
                            <FormField
                                control={profileForm.control}
                                name="clinicName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">Clinic Name</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="Your Clinic's Name" disabled={!isEditingProfile} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Separator/>
                            <FormField
                                control={profileForm.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">Email</FormLabel>
                                        <FormControl>
                                            <Input type="email" placeholder="your-email@example.com" {...field} disabled={!isEditingProfile} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Separator/>
                             <FormField
                                control={profileForm.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs text-muted-foreground">Phone</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="123-456-7890" disabled={!isEditingProfile} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             {isEditingProfile && (
                                <div className="flex justify-end gap-2 pt-4">
                                    <Button type="button" variant="ghost" onClick={handleCancelProfile}>Cancel</Button>
                                    <Button type="submit">
                                        <Save className="mr-2 h-4 w-4" />
                                        Save Changes
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </form>
                 </Form>
                <CardFooter>
                    <Form {...passwordForm}>
                        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="w-full space-y-4">
                            <FormField
                                control={passwordForm.control}
                                name="newPassword"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New Password</FormLabel>
                                    <FormControl>
                                    <Input type="password" placeholder="Enter new password" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={passwordForm.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Confirm New Password</FormLabel>
                                    <FormControl>
                                    <Input type="password" placeholder="Confirm new password" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full">Set New Password</Button>
                        </form>
                    </Form>
                </CardFooter>
             </Card>
            <Card>
                {loading ? (
                    <CardHeader>
                        <CardTitle>Loading...</CardTitle>
                    </CardHeader>
                ) : isEditingMobile || !credentials ? (
                    <>
                    <CardHeader>
                    <CardTitle>{credentials ? "Update Mobile App Login" : "Set Mobile App Login"}</CardTitle>
                    <CardDescription>
                        Set or update the username and password for the mobile token management app.
                    </CardDescription>
                    </CardHeader>
                    <Form {...mobileAppForm}>
                    <form onSubmit={mobileAppForm.handleSubmit(onMobileAppSubmit)}>
                        <CardContent className="space-y-4">
                        <FormField
                            control={mobileAppForm.control}
                            name="username"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                <Input placeholder="mobile-user" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={mobileAppForm.control}
                            name="password"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                {credentials ? "New Password" : "Password"}
                                </FormLabel>
                                <div className="relative">
                                <FormControl>
                                    <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    {...field}
                                    className="pr-10"
                                    />
                                </FormControl>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                    ) : (
                                    <Eye className="h-4 w-4" />
                                    )}
                                </Button>
                                </div>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        </CardContent>
                        <CardFooter className="flex justify-end gap-2">
                        {credentials && <Button type="button" variant="outline" onClick={handleCancelMobile}>Cancel</Button>}
                        <Button type="submit" disabled={mobileAppForm.formState.isSubmitting}>
                            {mobileAppForm.formState.isSubmitting ? "Saving..." : "Save Credentials"}
                        </Button>
                        </CardFooter>
                    </form>
                    </Form>
                    </>
                ) : (
                    <>
                    <CardHeader>
                        <CardTitle>Current Credentials</CardTitle>
                        <CardDescription>
                            This is the login information for the mobile token management app.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4 rounded-lg border p-4 bg-muted/40">
                            <UserCircle className="h-10 w-10 text-muted-foreground" />
                            <div>
                                <p className="text-sm text-muted-foreground">Username</p>
                                <p className="text-lg font-semibold">{credentials.username}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 rounded-lg border p-4 bg-muted/40">
                            <KeyRound className="h-10 w-10 text-muted-foreground" />
                            <div>
                                <p className="text-sm text-muted-foreground">Password</p>
                                {showSavedPassword ? (
                                    <p className="text-lg font-semibold">{credentials.password}</p>
                                ) : (
                                    <p className="text-lg font-semibold">••••••••</p>
                                )}
                            </div>
                        </div>
                        <CardDescription className="text-xs text-center">
                            The password shown is the last one saved to the database.
                        </CardDescription>
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
          </div>
        </main>
      </div>
    </>
  );
}
