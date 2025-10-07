
'use client';

import { useAuth } from '@/firebase';
import LoginPage from './(public)/login/page';
import AppLayout from './(app)/layout';
import DashboardPage from './(app)/dashboard/page';

export default function Page() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
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
