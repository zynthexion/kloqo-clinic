
"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page now redirects to the root, which is the new login page.
export default function LoginPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <p>Redirecting...</p>
    </div>
  );
}
