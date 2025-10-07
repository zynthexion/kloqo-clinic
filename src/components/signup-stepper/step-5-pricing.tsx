
'use client';

import { useFormContext } from 'react-hook-form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { SignUpFormData } from '@/app/signup/page';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../ui/form';

type StepProps = {
  data: SignUpFormData;
  updateData: (update: Partial<SignUpFormData>) => void;
};

const plans = [
    {
        name: 'Kloqo Lite',
        doctors: '1 doctor',
        price: '₹999',
        roi: 'If just 3 patients (₹300 × 3) show up instead of missing, Kloqo pays for itself.'
    },
    {
        name: 'Kloqo Grow',
        doctors: '2–4 doctors',
        price: '₹1,999',
        roi: 'Each doctor needs only 2–3 extra patients a month to cover the cost.'
    },
    {
        name: 'Kloqo Prime',
        doctors: '5–9 doctors',
        price: '₹3,999',
        roi: 'Recover one day of missed appointments and cover the entire month’s fee.'
    }
]

export function Step5Pricing() {
  const { control, watch } = useFormContext<SignUpFormData>();
  const plan = watch('plan');

  return (
    <div>
      <p className="text-sm text-muted-foreground">Step 5/7</p>
      <h2 className="text-2xl font-bold mb-1">Pricing & Payment</h2>
      <p className="text-muted-foreground mb-6">Choose a plan that fits your clinic's needs.</p>
      
      <div className="space-y-6">
        <FormField
          control={control}
          name="plan"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel className="font-semibold">Choose Your Plan <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <RadioGroup 
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  {plans.map(p => (
                    <FormItem key={p.name}>
                      <FormControl>
                        <RadioGroupItem value={p.name} id={p.name} className="sr-only" />
                      </FormControl>
                      <Label htmlFor={p.name} className="flex flex-col p-4 border rounded-lg cursor-pointer has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:*:text-primary-foreground transition-all">
                        <div className="text-center">
                            <span className="text-lg font-bold">{p.name}</span>
                            <p className="text-sm text-muted-foreground">{p.doctors}</p>
                        </div>
                        <div className="text-center my-4">
                            <span className="text-3xl font-bold">{p.price}</span>
                            <span className="text-sm text-muted-foreground">/month</span>
                        </div>
                        <p className="text-xs text-center text-muted-foreground flex-grow">{p.roi}</p>
                      </Label>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {plan && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
            <FormField
              control={control}
              name="promoCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Promo Code (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="KLOQO2025" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method (optional)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Card">Card</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="NetBanking">NetBanking</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
