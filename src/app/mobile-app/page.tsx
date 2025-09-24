
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { MobileAppHeader } from "@/components/layout/header";
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
import { collection, getDocs, setDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { MobileApp } from "@/lib/types";
import { TopNav } from "@/components/layout/top-nav";
import { Eye, EyeOff, UserCircle, KeyRound } from "lucide-react";

const formSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

type FormValues = z.infer<typeof formSchema>;

export default function MobileAppPage() {
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<MobileApp | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSavedPassword, setShowSavedPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    const fetchCredentials = async () => {
      setLoading(true);
      const credsCollection = collection(db, "mobile-app");
      const credsSnapshot = await getDocs(credsCollection);
      if (!credsSnapshot.empty) {
        const credsData = credsSnapshot.docs[0].data() as MobileApp;
        setCredentials(credsData);
        form.reset({
          username: credsData.username,
          password: "", 
        });
        setIsEditing(false);
      } else {
        setIsEditing(true);
      }
      setLoading(false);
    };
    fetchCredentials();
  }, [form]);

  const onSubmit = async (values: FormValues) => {
    try {
      const docId = credentials ? credentials.id : "credentials";
      const docRef = doc(db, "mobile-app", docId);
      
      const dataToSave: MobileApp = {
        id: docId,
        username: values.username,
        password: values.password, // In a real app, this should be hashed!
      };

      await setDoc(docRef, dataToSave, { merge: true });

      setCredentials(dataToSave);
      form.reset({
          username: values.username,
          password: "",
      });
      setIsEditing(false);
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

  const handleCancel = () => {
    if (credentials) {
        form.reset({
            username: credentials.username,
            password: "",
        });
        setIsEditing(false);
    }
  }

  return (
    <>
      <TopNav />
      <div>
        <MobileAppHeader />
        <main className="flex-1 p-6 bg-background">
          <Card className="max-w-2xl mx-auto">
             {loading ? (
                <CardHeader>
                    <CardTitle>Loading...</CardTitle>
                </CardHeader>
             ) : isEditing || !credentials ? (
                <>
                <CardHeader>
                  <CardTitle>{credentials ? "Update Mobile App Login" : "Set Mobile App Login"}</CardTitle>
                  <CardDescription>
                    Set or update the username and password for the mobile token management app.
                  </CardDescription>
                </CardHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
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
                        control={form.control}
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
                      {credentials && <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>}
                      <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting ? "Saving..." : "Save Credentials"}
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
                    <Button onClick={() => setIsEditing(true)}>Update Credentials</Button>
                </CardFooter>
                </>
             )}
          </Card>
        </main>
      </div>
    </>
  );
}
