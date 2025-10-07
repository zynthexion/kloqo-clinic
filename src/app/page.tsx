
'use client';

import { useAuth } from '@/firebase';
import LoginPage from './(public)/login/page';
import AppLayout from './(app)/layout';
import DashboardPage from './(app)/dashboard/page';

export default function Page() {
  const { currentUser, loading } = useAuth();

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

  return (
    <AppLayout>
      <DashboardPage />
    </AppLayout>
  );
}
