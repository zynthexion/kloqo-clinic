
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

const formSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

type FormValues = z.infer<typeof formSchema>;

export default function MobileAppPage() {
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<MobileApp | null>(null);
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

  return (
    <div className="flex flex-col">
      <TopNav />
      <div>
        <MobileAppHeader />
        <main className="flex-1 p-6 bg-background">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Manage Mobile App Login</CardTitle>
              <CardDescription>
                Set or update the username and password that will be used to log in to the mobile token management app.
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
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Saving..." : "Save Credentials"}
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </main>
      </div>
    </div>
  );
}

    