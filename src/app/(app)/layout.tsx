
"use client";

import { Sidebar } from '@/components/layout/sidebar';
import { OnboardingCheck } from '@/components/onboarding/onboarding-check';
import { AuthProvider } from '@/app/(app)/auth-provider';
import { Suspense } from 'react';
import ProtectedRoute from './protected-route';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><p>Loading...</p></div>}>
        <ProtectedRoute>
          <div className="flex h-full">
            <OnboardingCheck />
            <Sidebar />
            <div className="flex-1 flex flex-col h-full overflow-y-auto">
              {children}
            </div>
          </div>
        </ProtectedRoute>
      </Suspense>
    </AuthProvider>
  )
}
