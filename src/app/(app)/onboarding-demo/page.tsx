
"use client";

import { OnboardingCheck } from '@/components/onboarding/onboarding-check';
import AppLayout from './layout';

export default function OnboardingDemoPage({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppLayout>
        {children}
    </AppLayout>
  );
}
