'use client';

import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import type { SignUpFormData } from '@/app/(public)/signup/page';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

export function Step3ClinicLocation() {
  const { control, watch, setValue } = useFormContext<SignUpFormData>();
  const pincode = watch('pincode');
  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const [isFetchingPincode, setIsFetchingPincode] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [locationAutoFilled, setLocationAutoFilled] = useState(false);
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

  // Auto-fill from detected location when Step 3 loads
  useEffect(() => {
    const autoFillFromLocation = async () => {
      if (latitude && longitude && latitude !== 0 && longitude !== 0 && !locationAutoFilled) {
        setIsAutoFilling(true);
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1&zoom=16`
          );
          const data = await response.json();

          if (data && data.address) {
            const address = data.address;

            // Extract address components
            const streetNumber = address.house_number || '';
            const streetName = address.road || address.pedestrian || address.path || '';
            const suburb = address.suburb || address.neighbourhood || '';
            const city = address.city || address.town || address.village || address.municipality || '';
            const state = address.state || address.region || '';
            const postcode = address.postcode || '';

            // Construct address lines
            let addressLine1 = '';
            if (streetNumber && streetName) {
              addressLine1 = `${streetNumber} ${streetName}`;
            } else if (streetName) {
              addressLine1 = streetName;
            } else if (suburb) {
              addressLine1 = suburb;
            }

            // Auto-fill the form fields
            if (addressLine1) {
              setValue('address1', addressLine1, { shouldValidate: true });
            }
            if (city) {
              setValue('city', city, { shouldValidate: true });
            }
            if (state) {
              setValue('state', state, { shouldValidate: true });
            }
            if (postcode) {
              setValue('pincode', postcode, { shouldValidate: true });
            }

            setLocationAutoFilled(true);

            toast({
              title: 'Location Auto-filled',
              description: 'Your clinic address has been automatically filled from the detected location.',
            });
          }
        } catch (error) {
          console.error('Error auto-filling location:', error);
        } finally {
          setIsAutoFilling(false);
        }
      }
    };

    // Small delay to ensure form is ready
    const timeoutId = setTimeout(autoFillFromLocation, 100);
    return () => clearTimeout(timeoutId);
  }, [latitude, longitude, setValue, toast, locationAutoFilled]);

  return (
    <div>
      <p className="text-sm text-muted-foreground">Step 3/7</p>
      <h2 className="text-2xl font-bold mb-1">Clinic Location</h2>
      <p className="text-muted-foreground mb-6">To show clinics on map and assist patients.</p>

      {isAutoFilling && (
        <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400 text-blue-800 rounded flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Auto-filling location details from detected location...</span>
        </div>
      )}

      {locationAutoFilled && (
        <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-400 text-green-800 rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>Location details have been auto-filled from your detected location.</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLocationAutoFilled(false)}
            className="text-green-600 hover:text-green-800"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
      )}

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
