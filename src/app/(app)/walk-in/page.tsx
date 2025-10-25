
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, Clock, Users, Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppFrameLayout from '@/components/layout/app-frame';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import type { Appointment, Doctor, Patient } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format, isWithinInterval } from 'date-fns';
import { parseTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { managePatient } from '@/lib/patient-service';
import { calculateWalkInDetails } from '@/lib/appointment-service';
import PatientSearchResults from '@/components/clinic/patient-search-results';
import { Suspense } from 'react';

const formSchema = z.object({
  patientName: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  age: z.coerce.number().int().positive({ message: 'Age must be a positive number.' }),
  place: z.string().min(2, { message: 'Place is required.' }),
  sex: z.string().min(1, { message: 'Sex is required.' }),
  phone: z.string().min(10, { message: "Please enter a valid 10-digit phone number."}).max(10, { message: "Please enter a valid 10-digit phone number."}),
});

// Define a type for the unsaved appointment data
type UnsavedAppointment = Omit<Appointment, 'id'> & { createdAt: any };

function WalkInRegistrationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const doctorIdFromParams = searchParams.get('doctor');

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('manual');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const [isEstimateModalOpen, setIsEstimateModalOpen] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [estimatedConsultationTime, setEstimatedConsultationTime] = useState<Date | null>(null);
  const [patientsAhead, setPatientsAhead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [appointmentToSave, setAppointmentToSave] = useState<UnsavedAppointment | null>(null);


  // States for patient search
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSearchingPatient, setIsSearchingPatient] = useState(false);
  const [searchedPatients, setSearchedPatients] = useState<Patient[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { patientName: '', age: undefined, place: '', sex: '', phone: '' },
  });

  useEffect(() => {
    const id = localStorage.getItem('clinicId');
    if (!id) {
        router.push('/login');
        return;
    }
    setClinicId(id);
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/patient-form?clinicId=${id}`;
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`);

    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, [router]);
  
  const handlePatientSearch = useCallback(async (phone: string) => {
    if (phone.length < 10 || !clinicId) {
        setSearchedPatients([]);
        setShowForm(false);
        return;
    };
    setIsSearchingPatient(true);
    setShowForm(false);
    setSelectedPatientId(null);
    form.reset();

    try {
        const fullPhoneNumber = `+91${phone}`;
        const patientsRef = collection(db, 'patients');
        
        // Find the primary user record first based on the phone number
        const primaryQuery = query(patientsRef, where('phone', '==', fullPhoneNumber));
        const primarySnapshot = await getDocs(primaryQuery);

        if (primarySnapshot.empty) {
            setSearchedPatients([]);
            setShowForm(true); // No user found, show form to create one
            form.setValue('phone', phone);
            return;
        }

        const primaryDoc = primarySnapshot.docs[0];
        const primaryPatient = { id: primaryDoc.id, ...primaryDoc.data() } as Patient;
        primaryPatient.clinicIds = primaryPatient.clinicIds || [];

        let allRelatedPatients: Patient[] = [primaryPatient];

        if (primaryPatient.relatedPatientIds && primaryPatient.relatedPatientIds.length > 0) {
            const relatedPatientsQuery = query(patientsRef, where('__name__', 'in', primaryPatient.relatedPatientIds));
            const relatedSnapshot = await getDocs(relatedPatientsQuery);
            const relatedPatients = relatedSnapshot.docs.map(doc => {
                const data = { id: doc.id, ...doc.data()} as Patient;
                data.clinicIds = data.clinicIds || [];
                return data;
            });
            allRelatedPatients = [...allRelatedPatients, ...relatedPatients];
        }

        setSearchedPatients(allRelatedPatients);

    } catch (error) {
        console.error("Error searching patient:", error);
        toast({variant: 'destructive', title: 'Search Error', description: 'Could not perform patient search.'});
    } finally {
        setIsSearchingPatient(false);
    }
}, [clinicId, toast, form]);


  useEffect(() => {
        const debounceTimer = setTimeout(() => {
            if (phoneNumber && phoneNumber.length === 10) {
                handlePatientSearch(phoneNumber);
            } else {
                setSearchedPatients([]);
                setShowForm(false);
                setSelectedPatientId(null);
            }
        }, 500);

        return () => clearTimeout(debounceTimer);
  }, [phoneNumber, handlePatientSearch]);

  const selectPatient = (patient: Patient) => {
    setSelectedPatientId(patient.id);
    form.reset({
        patientName: patient.name,
        age: patient.age,
        place: patient.place,
        sex: patient.sex,
        phone: patient.phone.replace('+91', ''),
    });
    setShowForm(true);
  };


  const isDoctorConsultingNow = useMemo(() => {
    if (!doctor?.availabilitySlots) return false;

    const todayDay = format(currentTime, 'EEEE');
    const todaysAvailability = doctor.availabilitySlots.find(s => s.day === todayDay);
    if (!todaysAvailability) return false;

    return todaysAvailability.timeSlots.some(slot => {
        const startTime = parseTime(slot.from, currentTime);
        const endTime = parseTime(slot.to, currentTime);
        return isWithinInterval(currentTime, { start: startTime, end: endTime });
    });
  }, [doctor, currentTime]);

  useEffect(() => {
    if (!clinicId) return;
    const fetchDoctor = async () => {
      const doctorId = doctorIdFromParams || localStorage.getItem('selectedDoctorId');
      if (!doctorId) {
        setLoading(false);
        toast({ variant: 'destructive', title: 'Error', description: 'No doctor selected.' });
        return;
      }
      try {
        const docRef = doc(db, 'doctors', doctorId);
        const docSnap = await getDoc(docRef).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({ path: docRef.path, operation: 'get' });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });

        if (docSnap.exists() && docSnap.data().clinicId === clinicId) {
          setDoctor({ id: docSnap.id, ...docSnap.data() } as Doctor);
        } else {
          toast({ variant: 'destructive', title: 'Error', description: 'Doctor not found.' });
        }
      } catch (error: any) {
        if (error.name !== 'FirestorePermissionError') {
            console.error('Error fetching doctor:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch doctor details.' });
        }
      } finally {
        setLoading(false);
      }
    };
    fetchDoctor();
  }, [doctorIdFromParams, toast, clinicId]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!doctor || !clinicId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Doctor or clinic not identified.' });
        return;
    }
    setIsSubmitting(true);
    
    try {
        const clinicDocRef = doc(db, 'clinics', clinicId);
        const clinicSnap = await getDoc(clinicDocRef);
        const clinicData = clinicSnap.data();
        const walkInTokenAllotment = clinicData?.walkInTokenAllotment || 5;
        const walkInCapacityThreshold = clinicData?.walkInCapacityThreshold || 0.75;

        const { estimatedTime, patientsAhead, numericToken, slotIndex } = await calculateWalkInDetails(doctor, walkInTokenAllotment, walkInCapacityThreshold);
        
        const fullPhoneNumber = `+91${values.phone}`;
        const patientId = await managePatient({
            phone: fullPhoneNumber,
            name: values.patientName,
            age: values.age,
            place: values.place,
            sex: values.sex,
            clinicId,
            // For walk-ins, we can either use the existing patient's primary ID or create a new mock one.
            bookingUserId: selectedPatientId || `user_walkin_${fullPhoneNumber}`,
            bookingFor: selectedPatientId ? 'self' : 'new_related',
        });

        const tokenNumber = `W${String(numericToken).padStart(3, '0')}`;
      
        const newAppointmentData: UnsavedAppointment = {
            patientName: values.patientName,
            age: values.age,
            place: values.place,
            sex: values.sex,
            communicationPhone: fullPhoneNumber,
            patientId,
            doctor: doctor.name,
            department: doctor.department,
            bookedVia: 'Walk-in',
            date: format(new Date(), "d MMMM yyyy"),
            time: format(estimatedTime, "hh:mm a"),
            status: 'Pending',
            tokenNumber,
            numericToken: numericToken,
            clinicId,
            treatment: "General Consultation",
            createdAt: serverTimestamp(),
            slotIndex,
        };

        setAppointmentToSave(newAppointmentData);
        setEstimatedConsultationTime(estimatedTime);
        setPatientsAhead(patientsAhead);
        setGeneratedToken(tokenNumber);
        setIsEstimateModalOpen(true);

    } catch (error: any) {
        if(error.name !== 'FirestorePermissionError') {
            console.error('Failed to prepare walk-in:', error);
            toast({ variant: 'destructive', title: 'Error', description: (error as Error).message || "Could not complete registration." });
        }
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleProceedToToken = async () => {
    if (!appointmentToSave) {
        toast({ variant: 'destructive', title: 'Error', description: 'No appointment data to save.'});
        return;
    }

    try {
        const appointmentsCollection = collection(db, 'appointments');
        const newDocRef = doc(appointmentsCollection);
        await setDoc(newDocRef, {...appointmentToSave, id: newDocRef.id}).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
            path: 'appointments',
            operation: 'create',
            requestResourceData: appointmentToSave,
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });

        setIsEstimateModalOpen(false);
        setIsTokenModalOpen(true);
        
        setTimeout(() => {
            setIsTokenModalOpen(false);
            router.push('/dashboard');
        }, 5000);

    } catch (error) {
         if((error as any).name !== 'FirestorePermissionError') {
            console.error('Failed to save walk-in appointment:', error);
            toast({ variant: 'destructive', title: 'Error', description: "Could not save the appointment." });
        }
    }
  };


  if (loading) {
    return (
        <AppFrameLayout>
            <div className="flex flex-col h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        </AppFrameLayout>
    )
  }
  
  if (!isDoctorConsultingNow && !loading) {
     return (
        <AppFrameLayout>
             <div className="flex flex-col h-full">
                <header className="flex items-center gap-4 p-4 border-b">
                    <Link href="/">
                        <Button variant="ghost" size="icon">
                        <ArrowLeft />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold">Walk-in Registration</h1>
                    </div>
                </header>
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <h2 className="text-xl font-semibold">Doctor Not Available</h2>
                    <p className="text-muted-foreground mt-2">Walk-in registration is only available during the doctor's consultation hours.</p>
                </div>
            </div>
        </AppFrameLayout>
     )
  }

  return (
    <AppFrameLayout>
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-4 p-4 border-b">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Walk-in Registration</h1>
            {loading ? (
                <div className="h-4 bg-muted rounded w-48 animate-pulse mt-1"></div>
            ) : doctor ? (
                <p className="text-sm text-muted-foreground">For Dr. {doctor.name}</p>
            ) : (
                <p className="text-sm text-destructive">Doctor not found</p>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 bg-muted/20">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="qr">Scan QR Code</TabsTrigger>
              <TabsTrigger value="manual">Enter Manually</TabsTrigger>
            </TabsList>
            <TabsContent value="qr">
              <Card className="w-full text-center shadow-lg mt-4">
                <CardHeader>
                  <CardTitle className="text-2xl">Scan to Register</CardTitle>
                  <CardDescription>Scan the QR code with a phone to register.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center">
                  {qrCodeUrl ? (
                    <div className="p-4 bg-white rounded-lg border">
                      <Image
                        src={qrCodeUrl}
                        alt="QR Code for appointment booking"
                        width={250}
                        height={250}
                      />
                    </div>
                  ) : (
                    <div className="w-[250px] h-[250px] bg-gray-200 flex items-center justify-center rounded-lg">
                      <p className="text-muted-foreground">QR Code not available</p>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-4">Follow the instructions on your phone.</p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="manual">
               <Card className="w-full shadow-lg mt-4">
                  <CardHeader>
                    <CardTitle className="text-2xl">Manual Registration</CardTitle>
                    <CardDescription>Enter patient's phone number to begin.</CardDescription>
                  </CardHeader>
                  <CardContent>
                     <div className="space-y-4">
                        <div className="relative flex-1 flex items-center">
                            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm h-10">
                                +91
                            </span>
                            <Input 
                                type="tel"
                                placeholder="Enter 10-digit phone number"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                className="flex-1 rounded-l-none"
                                maxLength={10}
                            />
                            {isSearchingPatient && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin h-4 w-4 text-muted-foreground" />}
                        </div>

                        {searchedPatients.length > 0 && (
                            <PatientSearchResults 
                                patients={searchedPatients} 
                                onSelectPatient={selectPatient}
                                selectedPatientId={selectedPatientId}
                            />
                        )}

                        {showForm && (
                            <div className="pt-4 border-t">
                                <h3 className="mb-4 font-semibold text-lg">{selectedPatientId ? 'Confirm Details' : 'New Patient Form'}</h3>
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <FormField control={form.control} name="patientName" render={({ field }) => (
                                        <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="e.g. Jane Smith" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                     <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="age" render={({ field }) => (
                                            <FormItem><FormLabel>Age</FormLabel><FormControl><Input type="number" placeholder="e.g. 34" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="sex" render={({ field }) => (
                                            <FormItem><FormLabel>Sex</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select sex" /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Male">Male</SelectItem>
                                                        <SelectItem value="Female">Female</SelectItem>
                                                        <SelectItem value="Other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                     </div>
                                    <FormField control={form.control} name="place" render={({ field }) => (
                                        <FormItem><FormLabel>Place</FormLabel><FormControl><Input placeholder="e.g. Cityville" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <Button type="submit" className="w-full mt-6 bg-[#f38d17] hover:bg-[#f38d17]/90" disabled={isSubmitting || !doctor}>
                                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking Queue...</> : 'Get Token'}
                                    </Button>
                                    </form>
                                </Form>
                            </div>
                        )}
                     </div>
                  </CardContent>
                </Card>
            </TabsContent>
          </Tabs>
        </div>

        <Dialog open={isEstimateModalOpen} onOpenChange={setIsEstimateModalOpen}>
            <DialogContent className="sm:max-w-sm w-[90%]">
                <DialogHeader>
                    <DialogTitle className="text-center">Estimated Wait Time</DialogTitle>
                    <DialogDescription className="text-center">The clinic is busy at the moment. Here's the current wait status.</DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-center gap-6 text-center py-4">
                    <div className="flex flex-col items-center">
                        <Clock className="w-8 h-8 text-primary mb-2" />
                        <span className="text-xl font-bold">{estimatedConsultationTime ? `~ ${format(estimatedConsultationTime, 'hh:mm a')}` : 'Calculating...'}</span>
                        <span className="text-xs text-muted-foreground">Est. Time</span>
                    </div>
                     <div className="flex flex-col items-center">
                        <Users className="w-8 h-8 text-primary mb-2" />
                        <span className="text-2xl font-bold">{patientsAhead}</span>
                        <span className="text-xs text-muted-foreground">Patients Ahead</span>
                    </div>
                </div>
                <DialogFooter className="flex-col space-y-2">
                     <Button onClick={handleProceedToToken} className="w-full bg-accent text-accent-foreground hover:bg-accent/90" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "I'm OK to wait, Proceed"}
                    </Button>
                    <Button variant="outline" className="w-full" asChild>
                        <Link href="/book-appointment"><Calendar className="mr-2 h-4 w-4"/>Book for Another Day</Link>
                    </Button>
                    <DialogClose asChild>
                         <Button variant="ghost" className="w-full">Cancel</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isTokenModalOpen} onOpenChange={setIsTokenModalOpen}>
            <DialogContent className="sm:max-w-xs w-[90%] text-center p-6 sm:p-8">
                <DialogClose asChild>
                    <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-6 w-6 text-muted-foreground">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </Button>
                </DialogClose>
                 <div className="flex flex-col items-center space-y-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold">Walk-in Token Generated!</h2>
                        <p className="text-muted-foreground text-sm">Please wait for your turn. You'll be redirected to the live queue.</p>
                    </div>
                     <div>
                        <p className="text-sm text-muted-foreground">Your Token Number</p>
                        <p className="text-5xl font-bold text-primary">{generatedToken}</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
      </div>
    </AppFrameLayout>
  );
}
export default function WalkInRegistrationPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WalkInRegistrationContent />
    </Suspense>
  );
}