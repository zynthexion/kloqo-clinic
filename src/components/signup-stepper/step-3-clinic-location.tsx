
'use client';

import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import type { SignUpFormData } from '@/app/signup/page';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';

export function Step3ClinicLocation() {
  const { control } = useFormContext<SignUpFormData>();

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
                <Input placeholder="Kerala" {...field} />
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
              <FormControl>
                <Input type="text" placeholder="682016" {...field} />
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
