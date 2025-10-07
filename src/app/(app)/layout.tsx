
"use client";

import { Sidebar } from '@/components/layout/sidebar';
import { OnboardingCheck } from '@/components/onboarding/onboarding-check';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/login');
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
    <div className="flex h-full">
      <OnboardingCheck />
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
