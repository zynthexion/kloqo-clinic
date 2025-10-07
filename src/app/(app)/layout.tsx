
"use client";

import { Sidebar } from '@/components/layout/sidebar';
import { OnboardingCheck } from '@/components/onboarding/onboarding-check';
import { useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AuthLayoutContent({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/login');
    }
  }, [currentUser, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!currentUser) {
    return null; // or a loading spinner, as the redirect will happen
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


export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><p>Loading...</p></div>}>
      <AuthLayoutContent>{children}</AuthLayoutContent>
    </Suspense>
  )
}
