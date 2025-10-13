
'use client';

import { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SignUpFormData } from '@/app/(public)/signup/page';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Button } from '../ui/button';
import { MapPin, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function Step1ClinicProfile() {
  const { control, setValue, watch } = useFormContext<SignUpFormData>();
  const { toast } = useToast();
  const [isDetecting, setIsDetecting] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  
  const clinicType = watch('clinicType');
  const latitude = watch('latitude');

  useEffect(() => {
    if (clinicType === 'Single Doctor') {
      setValue('numDoctors', 1);
    } else if (clinicType === 'Multi-Doctor' && watch('numDoctors') < 2) {
      setValue('numDoctors', 2);
    }
  }, [clinicType, setValue, watch]);

  const handleDetectLocation = () => {
    if (navigator.geolocation) {
      setIsDetecting(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            setValue('latitude', latitude, { shouldValidate: true });
            setValue('longitude', longitude, { shouldValidate: true });

            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
            const data = await response.json();
            
            if (data && data.address) {
                const { city, town, village, country } = data.address;
                setLocationName(`${city || town || village || 'Unknown Location'}, ${country || ''}`);
            } else {
                setLocationName(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            }

            toast({
              title: "Location Detected",
              description: "Your clinic's location has been set.",
            });
          } catch (error) {
             console.error("Reverse geocoding error:", error);
             toast({
                variant: "destructive",
                title: "Location Error",
                description: "Could not fetch place name. Coordinates saved.",
             });
             setLocationName(`${watch('latitude').toFixed(4)}, ${watch('longitude').toFixed(4)}`);
          } finally {
            setIsDetecting(false);
          }
        },
        (error) => {
          console.error("Geolocation error:", error);
          toast({
            variant: "destructive",
            title: "Location Error",
            description: "Could not detect location. Please grant permission or enter manually.",
          });
          setIsDetecting(false);
        }
      );
    } else {
        toast({
            variant: "destructive",
            title: "Not Supported",
            description: "Geolocation is not supported by your browser.",
        });
    }
  };
  
  return (
    <div>
      <p className="text-sm text-muted-foreground">Step 1/7</p>
      <h2 className="text-2xl font-bold mb-1">Clinic Profile</h2>
      <div className="mb-2 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 rounded">
        <strong>Note:</strong> For accurate location, please ensure you are physically present at your clinic when signing up.
      </div>
      <p className="text-muted-foreground mb-6">Provide your clinic's primary information.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={control}
          name="clinicName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Clinic Name <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="e.g., Sree Narayana Medical Centre" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="clinicType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Clinic Type <span className="text-destructive">*</span></FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select clinic type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Single Doctor">Single Doctor</SelectItem>
                    <SelectItem value="Multi-Doctor">Multi-Doctor</SelectItem>
                  </SelectContent>
                </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="numDoctors"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number of Doctors</FormLabel>
              <FormControl>
                <Input type="number" min={clinicType === 'Multi-Doctor' ? 2 : 1} max={clinicType === 'Multi-Doctor' ? 15 : 1} placeholder="e.g., 3" {...field} value={field.value ?? ''} disabled={clinicType === 'Single Doctor'} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="clinicRegNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Clinic Registration Number (if any)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., KER/HSP/2025/203" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={control}
          name="skippedTokenRecurrence"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Skipped Token Recurrence</FormLabel>
              <FormControl>
                <Input type="number" min="2" placeholder="e.g., 3" {...field} value={field.value ?? ''} />
              </FormControl>
               <p className="text-xs text-muted-foreground">Call skipped token after these many tokens</p>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="walkInTokenAllotment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Walk-in Token Allotment</FormLabel>
              <FormControl>
                <Input type="number" min="2" placeholder="e.g., 5" {...field} value={field.value ?? ''} />
              </FormControl>
              <p className="text-xs text-muted-foreground">Allot one walk-in token after every X online tokens</p>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="md:col-span-2">
            <Button type="button" variant={latitude !== 0 ? "secondary" : "outline"} onClick={handleDetectLocation} className="w-full" disabled={isDetecting}>
                {isDetecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (latitude !== 0 ? <CheckCircle className="mr-2 h-4 w-4" /> : <MapPin className="mr-2 h-4 w-4" />)}
                {isDetecting ? 'Detecting...' : (latitude !== 0 ? 'Location Detected' : 'Detect My Location')}
            </Button>
            {latitude !== 0 && locationName && (
                <p className="text-sm text-muted-foreground text-center mt-2">
                    {locationName}
                </p>
            )}
            <FormField control={control} name="latitude" render={() => <FormMessage />} />
        </div>
      </div>
    </div>
  );
}
