
'use client';

import { useState, useMemo } from 'react';
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

  // Step 2
  ownerName: z.string().min(2, { message: "Owner name must be at least 2 characters." }),
  designation: z.enum(['Doctor', 'Owner'], { required_error: "Please select a designation." }),
  mobileNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Please enter a valid mobile number."),
  emailAddress: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),

  // Step 3
  address1: z.string().min(5, { message: "Address must be at least 5 characters." }),
  address2: z.string().optional(),
  city: z.string().min(2, { message: "City must be at least 2 characters." }),
  state: z.string().min(2, { message: "State must be at least 2 characters." }),
  pincode: z.string().regex(/^\d{6}$/, "Please enter a valid 6-digit pincode."),
  mapsLink: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),

  // Step 4
  hours: z.array(hoursSchema),
  avgPatientsPerDay: z.coerce.number().min(0, "Cannot be negative."),
  
  // Step 5
  plan: z.enum(['Kloqo Lite', 'Kloqo Grow', 'Kloqo Prime'], { required_error: "Please select a plan." }),
  promoCode: z.string().optional(),
  paymentMethod: z.enum(['Card', 'UPI', 'NetBanking'], { required_error: "Please select a payment method." }).optional(),

  // Step 6
  logo: z.any().optional(),
  license: z.any().optional(),
  receptionPhoto: z.any().optional(),

  // Step 7
  agreeTerms: z.boolean().refine(val => val === true, { message: "You must agree to the terms." }),
  isAuthorized: z.boolean().refine(val => val === true, { message: "You must confirm authorization." }),
});

export type SignUpFormData = z.infer<typeof signupSchema>;

const defaultFormData: SignUpFormData = {
  clinicName: '',
  clinicType: 'Single Doctor',
  numDoctors: 1,
  clinicRegNumber: '',
  
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
    { day: 'Monday', timeSlots: [{ open: '09:00', close: '17:00' }], isClosed: false },
    { day: 'Tuesday', timeSlots: [{ open: '09:00', close: '17:00' }], isClosed: false },
    { day: 'Wednesday', timeSlots: [{ open: '09:00', close: '17:00' }], isClosed: false },
    { day: 'Thursday', timeSlots: [{ open: '09:00', close: '17:00' }], isClosed: false },
    { day: 'Friday', timeSlots: [{ open: '09:00', close: '17:00' }], isClosed: false },
    { day: 'Saturday', timeSlots: [{ open: '10:00', close: '14:00' }], isClosed: false },
    { day: 'Sunday', timeSlots: [], isClosed: true },
  ],
  avgPatientsPerDay: 40,
  
  plan: 'Kloqo Grow',
  promoCode: '',
  paymentMethod: undefined,
  
  logo: null,
  license: null,
  receptionPhoto: null,

  agreeTerms: false,
  isAuthorized: false,
};

const stepFields: (keyof SignUpFormData)[][] = [
    ['clinicName', 'clinicType', 'numDoctors'], // Step 1
    ['ownerName', 'designation', 'mobileNumber', 'emailAddress', 'password'], // Step 2
    ['address1', 'city', 'state', 'pincode'], // Step 3
    [], // Step 4
    ['plan'], // Step 5
    [], // Step 6
    ['agreeTerms', 'isAuthorized'], // Step 7
]


export default function SignupPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const router = useRouter();
  const { toast } = useToast();

  const methods = useForm<SignUpFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: defaultFormData,
    mode: "onBlur"
  });

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

    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
        await methods.handleSubmit(onSubmit)();
    }
  };

  const onSubmit = async (formData: SignUpFormData) => {
    try {
        // Step 1: Create the user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, formData.emailAddress, formData.password);
        const user = userCredential.user;

        // Step 2: Create a new clinic document and get its ID
        const clinicRef = doc(collection(db, "clinics"));
        const clinicId = clinicRef.id;

        // Step 3: Create a batch write to save all data in one transaction
        const batch = writeBatch(db);

        // Add clinic data to the batch
        batch.set(clinicRef, {
            name: formData.clinicName,
            type: formData.clinicType,
            address: `${formData.address1}, ${formData.city}, ${formData.state} ${formData.pincode}`,
            operatingHours: formData.hours,
            plan: formData.plan,
            ownerEmail: formData.emailAddress,
        });

        // Add user profile data to the batch, linking it to the clinic
        const userRef = doc(db, "users", user.uid);
        batch.set(userRef, {
            uid: user.uid,
            clinicId: clinicId,
            email: formData.emailAddress,
            name: formData.ownerName,
            clinicName: formData.clinicName,
            phone: formData.mobileNumber,
            designation: formData.designation,
            onboarded: false, // Set onboarding flag
        });

        // Step 4: Commit the batch
        await batch.commit();

        toast({
            title: "Registration Successful!",
            description: "Your clinic has been created. Redirecting...",
        });

        router.push('/dashboard');

    } catch (error: any) {
        console.error("Signup error:", error);
        toast({
            variant: "destructive",
            title: "Registration Failed",
            description: error.message || "An unexpected error occurred. Please try again.",
        });
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentStepComponent = useMemo(() => {
    switch (currentStep) {
      case 1:
        return <Step1ClinicProfile />;
      case 2:
        return <Step2OwnerInfo />;
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
                <Button type="button" size="lg" onClick={handleNext}>
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
