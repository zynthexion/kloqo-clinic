
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
            // This case might happen if user doc is created but clinic creation fails
            if (pathname !== '/onboarding') router.push('/onboarding');
            return;
          }

          const departmentsQuery = query(collection(db, 'departments'), where('clinicId', '==', clinicId));
          const doctorsQuery = query(collection(db, 'doctors'), where('clinicId', '==', clinicId));

          const [departmentsSnapshot, doctorsSnapshot] = await Promise.all([
            getDocs(departmentsQuery),
            getDocs(doctorsQuery),
          ]);

          const needsOnboarding = departmentsSnapshot.empty || doctorsSnapshot.empty;

          if (needsOnboarding) {
            router.push('/onboarding');
          }
        } else {
            // If the user document doesn't exist for some reason, they need to onboard.
            if (pathname !== '/onboarding') router.push('/onboarding');
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
      }
    };

    // A small delay to ensure auth state is fully propagated
    const timer = setTimeout(() => {
        checkOnboardingStatus();
    }, 500);
    
    return () => clearTimeout(timer);

  }, [auth.currentUser, router, pathname]);

  return null; // This component does not render anything
}
