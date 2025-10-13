'use client';

import { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SignUpFormData } from '@/app/(public)/signup/page';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';

declare global {
    interface Window {
        recaptchaVerifier: RecaptchaVerifier;
        confirmationResult?: ConfirmationResult;
    }
}

export function Step2OwnerInfo({ onVerified }: { onVerified: () => void }) {
  const { control, watch, formState: { errors } } = useFormContext<SignUpFormData>();
  const { toast } = useToast();

  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const mobileNumber = watch('mobileNumber');
  const isMobileNumberValid = !errors.mobileNumber && mobileNumber?.length > 10;

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': (response: any) => {
          // reCAPTCHA solved, allow signInWithPhoneNumber.
        }
      });
    }
  }, []);

  const handleSendOtp = async () => {
    if (!isMobileNumberValid) return;
    setIsSending(true);
    try {
      const appVerifier = window.recaptchaVerifier;
      const confirmationResult = await signInWithPhoneNumber(auth, mobileNumber, appVerifier);
      window.confirmationResult = confirmationResult;
      setOtpSent(true);
      toast({ title: "OTP Sent", description: "An OTP has been sent to your mobile number." });
    } catch (error) {
      console.error("Error sending OTP:", error);
      toast({
        variant: "destructive",
        title: "Failed to Send OTP",
        description: "Please check the mobile number or try again.",
      });
       // Render the reCAPTCHA again
      window.recaptchaVerifier.render().then((widgetId) => {
        if(typeof window !== 'undefined'){
            window.recaptchaVerifier.reset(widgetId);
        }
      });
    } finally {
        setIsSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!window.confirmationResult) return;
    setIsVerifying(true);
    try {
        await window.confirmationResult.confirm(otp);
        toast({ title: "Verification Successful", description: "Your mobile number has been verified." });
        onVerified();
        setOtpSent(false); // Hide OTP UI
    } catch (error) {
        console.error("Error verifying OTP:", error);
        toast({
            variant: "destructive",
            title: "Invalid OTP",
            description: "The OTP you entered is incorrect. Please try again.",
        });
    } finally {
        setIsVerifying(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground">Step 2/7</p>
      <h2 className="text-2xl font-bold mb-1">Primary Contact Information</h2>
      <p className="text-muted-foreground mb-6">Details of the main contact person or owner.</p>
      
      <div id="recaptcha-container"></div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={control}
          name="ownerName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Owner / Admin Name <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="Dr. Asha Varma" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="designation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Designation <span className="text-destructive">*</span></FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select designation" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Doctor">Doctor</SelectItem>
                  <SelectItem value="Owner">Owner</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="md:col-span-2">
            <FormField
              control={control}
              name="mobileNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobile Number <span className="text-destructive">*</span></FormLabel>
                    <div className="flex gap-2">
                        <FormControl>
                            <Input type="tel" placeholder="+91 98765 43210" {...field} />
                        </FormControl>
                        {!otpSent && (
                             <Button type="button" onClick={handleSendOtp} disabled={!isMobileNumberValid || isSending}>
                                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                Send OTP
                            </Button>
                        )}
                    </div>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>
        
        {otpSent && (
            <div className="md:col-span-2 space-y-4 animate-in fade-in">
                <FormItem>
                    <FormLabel>Enter OTP</FormLabel>
                    <div className="flex gap-2">
                        <FormControl>
                            <Input 
                                type="text" 
                                placeholder="Enter 6-digit OTP" 
                                value={otp} 
                                onChange={(e) => setOtp(e.target.value)}
                                maxLength={6}
                            />
                        </FormControl>
                         <Button type="button" onClick={handleVerifyOtp} disabled={otp.length !== 6 || isVerifying}>
                            {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Verify OTP
                        </Button>
                    </div>
                </FormItem>
            </div>
        )}

        <FormField
          control={control}
          name="emailAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Address <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input type="email" placeholder="clinic@carewell.in" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={control}
          name="password"
          render={({ field }) => (
            <FormItem>
                <FormLabel>Password (for login)</FormLabel>
                <FormControl>
                    <Input type="password" {...field} />
                </FormControl>
                <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
