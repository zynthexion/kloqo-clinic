
'use client';

import { useFormContext } from 'react-hook-form';
import type { SignUpFormData } from '@/app/(public)/signup/page';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';
import { format, parse } from 'date-fns';

const plans = [
    { name: 'Kloqo Lite', price: '₹999' },
    { name: 'Kloqo Grow', price: '₹1,999' },
    { name: 'Kloqo Prime', price: '₹3,999' },
    { name: 'Free Plan (Beta)', price: 'Free' },
];

const formatTime = (time: string) => {
    try {
        return format(parse(time, 'HH:mm', new Date()), 'hh:mm a');
    } catch (e) {
        return time; // Return original if parsing fails
    }
}

export function Step7Confirm() {
  const { control, watch } = useFormContext<SignUpFormData>();
  const data = watch();
  const selectedPlan = plans.find(p => p.name === data.plan);
  const isFreePlan = data.plan === 'Free Plan (Beta)';

  const fullAddress = [
    data.addressLine1,
    data.addressLine2,
    data.city,
    data.district,
    data.state,
    data.pincode,
  ].filter(Boolean).join(', ');

  return (
    <div>
      <p className="text-sm text-muted-foreground">Step 7/7</p>
      <h2 className="text-2xl font-bold mb-1">Confirm and Register</h2>
      <p className="text-muted-foreground mb-6">Review your clinic's information before completing the registration.</p>
      
      <ScrollArea className="h-[450px] p-2">
        <div className="space-y-6 pr-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Clinic & Owner Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Clinic Name:</strong> {data.clinicName}</p>
              <p><strong>Clinic Type:</strong> {data.clinicType}</p>
              <p><strong>Owner:</strong> {data.ownerName} ({data.designation})</p>
              <p><strong>Contact:</strong> {data.mobileNumber} / {data.emailAddress}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Location</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p>{fullAddress}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Operating Hours</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.hours.map((hour, i) => (
                <div key={i} className="flex justify-between">
                  <span>{hour.day}</span>
                  <span className="font-semibold">{hour.isClosed ? 'Closed' : hour.timeSlots.map(ts => `${formatTime(ts.open)} - ${formatTime(ts.close)}`).join(', ')}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
                <CardTitle className="text-lg">Plan & Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                    <span>Selected Plan:</span>
                    <Badge>{data.plan || 'Not Selected'}</Badge>
                </div>
                {selectedPlan && !isFreePlan && (
                    <div className="flex justify-between items-center">
                        <span>Monthly Amount:</span>
                        <span className="font-semibold">{selectedPlan.price}/month</span>
                    </div>
                )}
                {!isFreePlan && (
                    <div className="flex justify-between items-center">
                        <span>Payment Method:</span>
                        <span className="font-semibold">{data.paymentMethod || 'Not Selected'}</span>
                    </div>
                )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
      
      <div className="mt-6 space-y-4">
        <FormField
          control={control}
          name="agreeTerms"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I agree to the Terms of Service and Privacy Policy
                </FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="isAuthorized"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I confirm I am authorized to register this clinic
                </FormLabel>
                 <FormMessage />
              </div>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
