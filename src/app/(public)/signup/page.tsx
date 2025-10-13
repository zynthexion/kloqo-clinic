
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StepperNav } from '@/components/signup-stepper/stepper-nav';
import { Step1ClinicProfile } from '@/components/signup-stepper/step-1-clinic-profile';
import { Step2OwnerInfo } from '@/components/signup-stepper/step-2-owner-info';
import { Step3ClinicLocation } from '@/components/signup-stepper/step-3-clinic-location';
import { Step4Hours } from '@/components/signup-stepper/step-4-hours';
import { Step5Pricing } from '@/components/signup-stepper/step-5-pricing';
import { Step6Uploads } from '@/components/signup-stepper/step-6-uploads';
import { Step7Confirm } from '@/components/signup-stepper/step-7-confirm';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PeterdrawLogo } from '@/components/icons';
import Link from 'next/link';

import { useToast } from '@/hooks/use-toast';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { auth, db } from '@/lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { writeBatch, doc, collection } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const timeSlotSchema = z.object({
  open: z.string().min(1, 'Required'),
  close: z.string().min(1, 'Required'),
});

const hoursSchema = z.object({
  day: z.string(),
  timeSlots: z.array(timeSlotSchema),
  isClosed: z.boolean(),
});

const signupSchema = z.object({
  // Step 1
  clinicName: z.string().min(3, { message: "Clinic name must be at least 3 characters." }),
  clinicType: z.enum(['Single Doctor', 'Multi-Doctor'], { required_error: "Please select a clinic type." }),
  numDoctors: z.coerce.number().min(1, "There must be at least one doctor."),
  clinicRegNumber: z.string().optional(),
  latitude: z.coerce.number().min(-90, "Invalid latitude").max(90, "Invalid latitude").refine(val => val !== 0, "Please detect your location."),
  longitude: z.coerce.number().min(-180, "Invalid longitude").max(180, "Invalid longitude").refine(val => val !== 0, "Please detect your location."),
  skippedTokenRecurrence: z.coerce.number().min(2, "Value must be at least 2."),
  walkInTokenAllotment: z.coerce.number().min(2, "Value must be at least 2."),

  // Step 2
  ownerName: z.string().min(2, { message: "Owner name must be at least 2 characters." }),
  designation: z.enum(['Doctor', 'Owner'], { required_error: "Please select a designation." }),
  mobileNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Please enter a valid mobile number."),
  emailAddress: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),

  // Step 3
  address1: z.string().min(5, { message: "Address must be at least 5 characters." }),
  address2: z.string(),
  city: z.string().min(2, { message: "City must be at least 2 characters." }),
  state: z.string().min(2, { message: "State must be at least 2 characters." }),
  pincode: z.string().regex(/^\d{6}$/, "Please enter a valid 6-digit pincode."),
  mapsLink: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),

  // Step 4
  hours: z.array(hoursSchema),
  avgPatientsPerDay: z.coerce.number().min(0, "Cannot be negative."),
  
  // Step 5
  plan: z.enum(['Free Plan (Beta)', 'Kloqo Lite', 'Kloqo Grow', 'Kloqo Prime'], { required_error: "Please select a plan." }),
  promoCode: z.string(),
  paymentMethod: z.enum(['Card', 'UPI', 'NetBanking'], { required_error: "Please select a payment method." }),

  // Step 6
  logo: z.any(),
  license: z.any(),
  receptionPhoto: z.any(),

  // Step 7
  agreeTerms: z.boolean().refine(val => val === true, { message: "You must agree to the terms." }),
  isAuthorized: z.boolean().refine(val => val === true, { message: "You must confirm authorization." }),
}).refine(data => {
    if (data.clinicType === 'Multi-Doctor') {
        return data.numDoctors >= 2 && data.numDoctors <= 15;
    }
    return true;
}, {
    message: "For a multi-doctor clinic, please enter between 2 and 15 doctors.",
    path: ["numDoctors"],
});

export type SignUpFormData = z.infer<typeof signupSchema>;

const defaultFormData: SignUpFormData = {
  clinicName: '',
  clinicType: 'Single Doctor',
  numDoctors: 1,
  clinicRegNumber: '',
  latitude: 0,
  longitude: 0,
  skippedTokenRecurrence: 3,
  walkInTokenAllotment: 5,
  
  ownerName: '',
  designation: 'Doctor',
  mobileNumber: '',
  emailAddress: '',
  password: '',
  
  address1: '',
  address2: '',
  city: '',
  state: '',
  pincode: '',
  mapsLink: '',
  
  hours: [
    { day: 'Monday', timeSlots: [{ open: '09:00', close: '13:00' }], isClosed: false },
    { day: 'Tuesday', timeSlots: [{ open: '09:00', close: '13:00' }], isClosed: false },
    { day: 'Wednesday', timeSlots: [{ open: '09:00', close: '13:00' }], isClosed: false },
    { day: 'Thursday', timeSlots: [{ open: '09:00', close: '13:00' }], isClosed: false },
    { day: 'Friday', timeSlots: [{ open: '09:00', close: '13:00' }], isClosed: false },
    { day: 'Saturday', timeSlots: [{ open: '09:00', close: '13:00' }], isClosed: false },
    { day: 'Sunday', timeSlots: [{ open: '09:00', close: '13:00' }], isClosed: true },
  ],
  avgPatientsPerDay: 0,
  
  plan: 'Free Plan (Beta)',
  promoCode: '',
  paymentMethod: 'Card',
  
  logo: null,
  license: null,
  receptionPhoto: null,

  agreeTerms: false,
  isAuthorized: false,
};

const stepFields: (keyof SignUpFormData)[][] = [
    ['clinicName', 'clinicType', 'numDoctors', 'latitude', 'longitude', 'skippedTokenRecurrence', 'walkInTokenAllotment'], // Step 1
    ['ownerName', 'designation', 'mobileNumber', 'emailAddress', 'password'], // Step 2
    ['address1', 'city', 'state', 'pincode'], // Step 3
    ['hours', 'avgPatientsPerDay'], // Step 4
    ['plan'], // Step 5
    [], // Step 6
    ['agreeTerms', 'isAuthorized'], // Step 7
]


export default function SignupPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const methods = useForm<SignUpFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: defaultFormData,
    mode: "onBlur"
  });
  
  const { formState: { errors }, watch } = methods;

  const steps = [
    { number: 1, title: 'Clinic Profile', description: 'Basic clinic details' },
    { number: 2, title: 'Owner Information', description: 'Primary contact details' },
    { number: 3, title: 'Clinic Location', description: 'Help patients find you' },
    { number: 4, title: 'Operation Details', description: 'Set your working hours' },
    { number: 5, title: 'Pricing & Payment', description: 'Choose your plan' },
    { number: 6, title: 'Uploads', description: 'Add trust and branding' },
    { number: 7, title: 'Confirmation', description: 'Review and finish' },
  ];
  
  const handleNext = async () => {
    const fieldsToValidate = stepFields[currentStep - 1];
    const isValid = await methods.trigger(fieldsToValidate as any);

    if (!isValid) {
        toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Please fill out all required fields correctly.",
        });
        return;
    }
    
    if (currentStep === 2 && !isPhoneVerified) {
        toast({
            variant: "destructive",
            title: "Verification Required",
            description: "Please verify your mobile number to continue.",
        });
        return;
    }

    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
        await methods.handleSubmit(onSubmit)();
    }
  };

  const onSubmit = async (formData: SignUpFormData) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, formData.emailAddress, formData.password);
        const user = userCredential.user;

        // --- File upload logic ---
        const uploadFileToStorage = async (file: File | null, path: string) => {
          if (!file) return null;
          const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
          const { storage } = await import('@/lib/firebase');
          const fileRef = ref(storage, path);
          await uploadBytes(fileRef, file);
          return await getDownloadURL(fileRef);
        };
        const logoUrl = await uploadFileToStorage(formData.logo, `clinics/${user.uid}/logo`);
        const licenseUrl = await uploadFileToStorage(formData.license, `clinics/${user.uid}/license`);
        const receptionPhotoUrl = await uploadFileToStorage(formData.receptionPhoto, `clinics/${user.uid}/receptionPhoto`);
        // --- End file upload logic ---

        const clinicRef = doc(collection(db, "clinics"));
        const clinicId = clinicRef.id;
        const clinicData = {
            id: clinicId,
            name: formData.clinicName,
            type: formData.clinicType,
            address: `${formData.address1}, ${formData.city}, ${formData.state} ${formData.pincode}`,
            operatingHours: formData.hours,
            plan: formData.plan,
            ownerEmail: formData.emailAddress,
            latitude: formData.latitude,
            longitude: formData.longitude,
            skippedTokenRecurrence: formData.skippedTokenRecurrence,
            walkInTokenAllotment: formData.walkInTokenAllotment,
            numDoctors: formData.numDoctors,
            clinicRegNumber: formData.clinicRegNumber,
            mapsLink: formData.mapsLink,
            logoUrl,
            licenseUrl,
            receptionPhotoUrl,
            planStartDate: new Date().toISOString(),
            registrationStatus: "Pending",
            onboardingStatus: "Pending",
        };

        const userRef = doc(db, "users", user.uid);
        const userData = {
            uid: user.uid,
            clinicId: clinicId,
            email: formData.emailAddress,
            name: formData.ownerName,
            clinicName: formData.clinicName,
            phone: formData.mobileNumber,
            designation: formData.designation,
            onboarded: false,
        };

        const mobileAppCredsRef = doc(collection(db, "mobile-app"));
        const mobileUsername = formData.clinicName.toLowerCase().replace(/\s+/g, '-') + '-mobile';
        const mobilePassword = 'password123';
        const mobileCredsData = {
            id: mobileAppCredsRef.id,
            clinicId: clinicId,
            username: mobileUsername,
            password: mobilePassword,
        };

        const batch = writeBatch(db);
        batch.set(clinicRef, clinicData);
        batch.set(userRef, userData);
        batch.set(mobileAppCredsRef, mobileCredsData);
        
        await batch.commit().catch(async (serverError) => {
            const errorContexts = [
                { path: clinicRef.path, data: clinicData, operation: 'create' as const },
                { path: userRef.path, data: userData, operation: 'create' as const },
                { path: mobileAppCredsRef.path, data: mobileCredsData, operation: 'create' as const }
            ];
            
            errorContexts.forEach(context => {
                const permissionError = new FirestorePermissionError({
                    path: context.path,
                    operation: context.operation,
                    requestResourceData: context.data,
                });
                errorEmitter.emit('permission-error', permissionError);
            });
            throw serverError; // Re-throw to prevent subsequent success logic
        });
        
        if (typeof window !== 'undefined') {
          localStorage.setItem('signupEmail', formData.emailAddress);
        }

        toast({
            title: "Registration Successful!",
            description: "Your clinic has been created. Redirecting...",
        });

        router.push('/dashboard');

    } catch (error: any) {
        if (error.name !== 'FirestorePermissionError') {
            console.error("Signup error:", error);
            toast({
                variant: "destructive",
                title: "Registration Failed",
                description: error.message || "An unexpected error occurred. Please try again.",
            });
        }
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const isStepValid = useMemo(() => {
    console.log("Checking step validity. Current errors:", JSON.stringify(errors, null, 2));
    const fieldsForStep = stepFields[currentStep - 1];
    if (fieldsForStep.length === 0) {
        console.log("Step valid: No fields to validate.");
        return true;
    }
    
    const hasErrors = fieldsForStep.some(field => errors[field]);
    if (hasErrors) {
        console.log("Step invalid: hasErrors is true.");
        const stepErrors = fieldsForStep.reduce((acc, field) => {
            if (errors[field]) {
                // @ts-ignore
                acc[field] = errors[field].message;
            }
            return acc;
        }, {} as Record<string, string>);
        console.log("Errors in this step:", stepErrors);
        return false;
    }

    // Special checks for specific steps
    if (currentStep === 1) {
      const lat = watch('latitude');
      if (lat === 0) {
        console.log("Step invalid: Latitude is 0.");
        return false;
      }
    }
    
    if (currentStep === 2) {
      if (!isPhoneVerified) {
        console.log("Step invalid: Phone not verified.");
        return false;
      }
    }
    
    console.log("Step is valid.");
    return true; // If no errors and special conditions are met, the step is valid.
  }, [errors, currentStep, isPhoneVerified, watch]);


  const currentStepComponent = useMemo(() => {
    switch (currentStep) {
      case 1:
        return <Step1ClinicProfile />;
      case 2:
        return <Step2OwnerInfo onVerified={() => setIsPhoneVerified(true)} />;
      case 3:
        return <Step3ClinicLocation />;
      case 4:
        return <Step4Hours />;
      case 5:
        return <Step5Pricing />;
      case 6:
        return <Step6Uploads />;
      case 7:
        return <Step7Confirm />;
      default:
        return null;
    }
  }, [currentStep]);

  return (
    <div className="bg-gray-50 min-h-screen p-8 flex items-center justify-center">
      <Card className="w-full max-w-7xl h-[800px] flex p-0 overflow-hidden shadow-2xl">
        <aside className="w-1/4 bg-slate-100 p-8 flex flex-col justify-between">
          <div className="flex-grow flex flex-col overflow-hidden">
            <Link href="/" className="flex items-center gap-2 mb-12 flex-shrink-0">
              <PeterdrawLogo className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">Kloqo</span>
            </Link>
            <div className="flex-grow overflow-y-auto pr-4">
                <StepperNav steps={steps} currentStep={currentStep} />
            </div>
          </div>
        </aside>

        <main className="w-3/4 p-8 flex flex-col">
          <FormProvider {...methods}>
            <form onSubmit={methods.handleSubmit(onSubmit)} className="flex flex-col h-full">
              <header className="flex justify-end items-center mb-8">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link href="/" className="text-primary hover:underline">
                    Sign In
                  </Link>
                </p>
              </header>

              <div className="flex-grow overflow-y-auto pr-4">
                {currentStepComponent}
              </div>

              <footer className="flex justify-between items-center mt-8 pt-6 border-t">
                 {currentStep > 1 ? (
                  <Button type="button" variant="outline" onClick={handleBack}>
                    Back
                  </Button>
                ) : <div />}
                <Button 
                    type="button" 
                    size="lg" 
                    onClick={handleNext}
                    disabled={!isStepValid}
                >
                  {currentStep === steps.length ? 'Register Clinic' : 'Next'}
                </Button>
              </footer>
            </form>
          </FormProvider>
        </main>
      </Card>
    </div>
  );
}
