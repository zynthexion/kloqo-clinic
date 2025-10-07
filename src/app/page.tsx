
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/firebase';
import { useEffect } from 'react';
import LoginPage from './(public)/login/page';
import DashboardPage from './(app)/dashboard/page';

export default function Page() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (currentUser && (pathname === '/' || pathname === '/login')) {
        router.replace('/dashboard');
      } else if (!currentUser && pathname !== '/' && pathname !== '/login' && pathname !== '/signup') {
        router.replace('/');
      }
    }
  }, [currentUser, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }
  
  if (!currentUser) {
    return <LoginPage />;
  }

  // This is a catch-all for when the user is logged in but might be on the root path
  if(pathname === '/') {
     return <DashboardPage />;
  }

  // This should not be reached if routing is correct, but as a fallback
  return <LoginPage />;
}
