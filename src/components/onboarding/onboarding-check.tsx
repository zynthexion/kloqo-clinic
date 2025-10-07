
"use client";

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';

export function OnboardingCheck() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!auth.currentUser || pathname === '/onboarding') return;

    const checkOnboardingStatus = async () => {
      try {
        const userDocRef = doc(db, "users", auth.currentUser!.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const clinicId = userDoc.data()?.clinicId;
          if (!clinicId) {
            if (pathname !== '/onboarding') router.push('/onboarding');
            return;
          }

          const departmentsQuery = query(collection(db, `clinics/${clinicId}/departments`));
          const doctorsQuery = query(collection(db, `clinics/${clinicId}/doctors`));
          
          const [departmentsSnapshot, doctorsSnapshot] = await Promise.all([
            getDocs(departmentsQuery),
            getDocs(doctorsQuery),
          ]);

          const needsOnboarding = departmentsSnapshot.empty || doctorsSnapshot.empty;

          if (needsOnboarding) {
            router.push('/onboarding');
          }
        } else {
            if (pathname !== '/onboarding') router.push('/onboarding');
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
      }
    };

    const timer = setTimeout(() => {
        checkOnboardingStatus();
    }, 500);
    
    return () => clearTimeout(timer);

  }, [auth.currentUser, router, pathname]);

  return null; // This component does not render anything
}
