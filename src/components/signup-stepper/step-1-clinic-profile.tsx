
'use client';

import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SignUpFormData } from '@/app/(public)/signup/page';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';

export function Step1ClinicProfile() {
  const { control } = useFormContext<SignUpFormData>();
  
  return (
    <div>
      <p className="text-sm text-muted-foreground">Step 1/7</p>
      <h2 className="text-2xl font-bold mb-1">Clinic Profile</h2>
      <p className="text-muted-foreground mb-6">Provide your clinic's primary information.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={control}
          name="clinicName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Clinic Name <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="CareWell Multi-Speciality Clinic" {...field} />
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
                <Input type="number" min="1" placeholder="e.g., 5" {...field} />
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
                <Input placeholder="KER/HSP/2025/203" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={control}
          name="latitude"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Latitude</FormLabel>
              <FormControl>
                <Input type="number" placeholder="e.g., 9.9312" {...field} />
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
                <Input type="number" placeholder="e.g., 76.2673" {...field} />
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
                <Input type="number" placeholder="e.g., 5" {...field} />
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
                <Input type="number" placeholder="e.g., 15" {...field} />
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
