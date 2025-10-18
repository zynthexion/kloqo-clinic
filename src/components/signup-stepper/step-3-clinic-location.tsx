
'use client';

import { useFormContext } from 'react-hook-form';
import type { SignUpFormData } from '@/app/(public)/signup/page';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MapPin } from 'lucide-react';
import { Textarea } from '../ui/textarea';

export function Step3ClinicLocation() {
  const { control, watch, setValue } = useFormContext<SignUpFormData>();
  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [locationAutoFilled, setLocationAutoFilled] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const autoFillFromLocation = async () => {
      if (latitude && longitude && latitude !== 0 && longitude !== 0 && !locationAutoFilled) {
        setIsAutoFilling(true);
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();

          if (data && data.display_name) {
            setValue('address', data.display_name, { shouldValidate: true });
            setLocationAutoFilled(true);
            toast({
              title: 'Location Auto-filled',
              description: 'Your clinic address has been automatically filled.',
            });
          }
        } catch (error) {
          console.error('Error auto-filling location:', error);
          toast({
            variant: "destructive",
            title: "Auto-fill Failed",
            description: "Could not fetch address details. Please enter manually.",
          });
        } finally {
          setIsAutoFilling(false);
        }
      }
    };

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
          <span>Auto-filling address from detected location...</span>
        </div>
      )}

      {locationAutoFilled && (
        <div className="mb-4 p-3 bg-green-50 border-l-4 border-green-400 text-green-800 rounded flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          <span>Address has been auto-filled. You can edit it if needed.</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <FormField
          control={control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Clinic Address <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="e.g., 14/46, City Centre Building, MG Road, Kochi, Kerala - 682016" 
                  {...field}
                  rows={4}
                />
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
                <Textarea 
                  placeholder="https://maps.app.goo.gl/..." 
                  {...field} 
                  rows={2}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
