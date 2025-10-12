
'use client';

import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SignUpFormData } from '@/app/(public)/signup/page';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { Button } from '../ui/button';
import { MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function Step1ClinicProfile() {
  const { control, setValue } = useFormContext<SignUpFormData>();
  const { toast } = useToast();

  const handleDetectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setValue('latitude', latitude, { shouldValidate: true });
          setValue('longitude', longitude, { shouldValidate: true });
          toast({
            title: "Location Detected",
            description: "Latitude and Longitude have been filled automatically.",
          });
        },
        (error) => {
          console.error("Geolocation error:", error);
          toast({
            variant: "destructive",
            title: "Location Error",
            description: "Could not detect location. Please grant permission or enter manually.",
          });
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
                <Input type="number" min="1" placeholder="e.g., 3" {...field} value={field.value ?? ''} />
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
        <div className="md:col-span-2">
            <Button type="button" variant="outline" onClick={handleDetectLocation} className="w-full">
                <MapPin className="mr-2 h-4 w-4" />
                Detect My Location
            </Button>
        </div>
         <FormField
          control={control}
          name="latitude"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Latitude</FormLabel>
              <FormControl>
                <Input type="number" placeholder="e.g., 9.9312 (Kerala)" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={control}
          name="longitude"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Longitude</FormLabel>
              <FormControl>
                <Input type="number" placeholder="e.g., 76.2673 (Kerala)" {...field} value={field.value ?? ''} />
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
                <Input type="number" placeholder="e.g., 5" {...field} value={field.value ?? ''} />
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
              <FormLabel>Walk-in Token Allotment (minutes)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="e.g., 15" {...field} value={field.value ?? ''} />
              </FormControl>
              <p className="text-xs text-muted-foreground">Allot walk-in token after this many minutes</p>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
