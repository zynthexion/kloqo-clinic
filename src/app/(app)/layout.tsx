
"use client";

import { Sidebar } from '@/components/layout/sidebar';
import { OnboardingCheck } from '@/components/onboarding/onboarding-check';
import { Suspense, useEffect } from 'react';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { useAppointmentStatusUpdater } from '@/hooks/useAppointmentStatusUpdater';
import { AuthProvider } from './auth-provider';

function AppContent({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  // Custom hook to handle automatic status updates
  useAppointmentStatusUpdater();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/');
    }
  }, [currentUser, loading, router]);
  
  if (loading || !currentUser) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <p>Loading...</p>
        </div>
    );
  }

  return (
      <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><p>Loading...</p></div>}>
          <div className="flex h-full">
            <OnboardingCheck />
            <FirebaseErrorListener />
            <Sidebar />
            <div className="flex-1 flex flex-col h-full overflow-y-auto">
              {children}
            </div>
          </div>
      </Suspense>
  );
}


export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <AppContent>{children}</AppContent>
    </AuthProvider>
  );
}
