
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PeterdrawLogo } from '@/components/icons';
import { useRouter } from 'next/navigation';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handlePasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    if (!auth) {
      toast({
        variant: "destructive",
        title: "Initialization Error",
        description: "Authentication service is not ready. Please try again in a moment.",
      });
      setLoading(false);
      return;
    }
    
    try {
        await sendPasswordResetEmail(auth, email);
        toast({ title: "Password Reset Email Sent", description: "Please check your inbox for instructions to reset your password." });
        setEmailSent(true);
    } catch (error: any) {
        console.error("Password reset failed:", error);
        toast({
            variant: "destructive",
            title: "Password Reset Failed",
            description: "Could not send reset email. Please ensure the email address is correct.",
        });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div
      className="w-full h-screen bg-cover bg-center flex items-center justify-center"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1920&h=1080&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8bWVkaWNpbmV8ZW58MHx8MHx8fDA%3D')",
      }}
    >
      <div className="absolute inset-0 bg-primary/80" />
      <Card className="mx-auto w-[400px] z-10">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <PeterdrawLogo className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold font-headline">Kloqo</h1>
          </div>
          <CardTitle className="text-3xl font-bold">Forgot Your Password?</CardTitle>
          <CardDescription className="text-balance text-muted-foreground">
            {emailSent 
              ? "A password reset link has been sent to your email."
              : "No problem. Enter your email and we'll send you a reset link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!emailSent ? (
            <form className="grid gap-4" onSubmit={handlePasswordReset}>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
            </form>
          ) : (
            <Button variant="outline" className="w-full" asChild>
                <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
