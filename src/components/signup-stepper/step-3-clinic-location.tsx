
'use client';

import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import type { SignUpFormData } from '@/app/(public)/signup/page';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export function Step3ClinicLocation() {
  const { control, watch, setValue } = useFormContext<SignUpFormData>();
  const pincode = watch('pincode');
  const [isFetchingPincode, setIsFetchingPincode] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchPincodeData = async () => {
      if (pincode && pincode.length === 6) {
        setIsFetchingPincode(true);
        try {
          const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
          const data = await response.json();
          
          if (data && data[0].Status === 'Success') {
            const postOffice = data[0].PostOffice[0];
            setValue('city', postOffice.District, { shouldValidate: true });
            setValue('state', postOffice.State, { shouldValidate: true });
            toast({
              title: "Location Fetched",
              description: `City and State have been set to ${postOffice.District}, ${postOffice.State}.`,
            });
          } else {
             toast({
              variant: "destructive",
              title: "Invalid Pincode",
              description: "Could not find location data for this pincode.",
            });
          }
        } catch (error) {
          console.error("Error fetching pincode data:", error);
           toast({
              variant: "destructive",
              title: "API Error",
              description: "Failed to fetch pincode data. Please enter manually.",
            });
        } finally {
          setIsFetchingPincode(false);
        }
      }
    };

    const timeoutId = setTimeout(() => {
        fetchPincodeData();
    }, 500); // Debounce API call

    return () => clearTimeout(timeoutId);
  }, [pincode, setValue, toast]);


  return (
    <div>
      <p className="text-sm text-muted-foreground">Step 3/7</p>
      <h2 className="text-2xl font-bold mb-1">Clinic Location</h2>
      <p className="text-muted-foreground mb-6">To show clinics on map and assist patients.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={control}
          name="address1"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Address Line 1 <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="14 MG Road" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="address2"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Address Line 2 (optional)</FormLabel>
              <FormControl>
                <Input placeholder="Near City Hospital" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={control}
          name="pincode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pincode <span className="text-destructive">*</span></FormLabel>
              <div className="relative">
                <FormControl>
                  <Input type="text" placeholder="682016" {...field} />
                </FormControl>
                {isFetchingPincode && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City / District <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="Kochi" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>State <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="Kerala" {...field} readOnly />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
       
        <FormField
          control={control}
          name="mapsLink"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Google Maps Link (optional)</FormLabel>
              <FormControl>
                <Input type="url" placeholder="https://maps.google.com/..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
