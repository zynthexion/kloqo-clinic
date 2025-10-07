
"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/firebase';

// This page acts as a gatekeeper.
// If the user is logged in, it will redirect to the dashboard.
// If not, it will redirect to the login page.
export default function RootPage() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (currentUser) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [currentUser, loading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <p>Loading...</p>
    </div>
  );
}
