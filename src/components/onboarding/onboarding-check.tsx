
"use client";

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { collection, getDocs, doc, getDoc, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';

export function OnboardingCheck() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!auth.currentUser || auth.loading) return;
    
    // Don't run the check if we are already on the onboarding page
    if (pathname === '/onboarding') return;

    const checkOnboardingStatus = async () => {
      try {
        const userDocRef = doc(db, "users", auth.currentUser!.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const clinicId = userDoc.data()?.clinicId;
          
          if (!clinicId) {
            router.push('/onboarding');
            return;
          }

          const departmentsQuery = query(collection(db, "clinics", clinicId, "departments"), limit(1));
          const departmentsSnapshot = await getDocs(departmentsQuery);
          
          const doctorsQuery = query(collection(db, "clinics", clinicId, "doctors"), limit(1));
          const doctorsSnapshot = await getDocs(doctorsQuery);

          const needsOnboarding = departmentsSnapshot.empty || doctorsSnapshot.empty;

          if (needsOnboarding) {
            router.push('/onboarding');
          }
        } else {
          // If the user document doesn't exist, they need to onboard.
          router.push('/onboarding');
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
      }
    };

    checkOnboardingStatus();

  }, [auth.currentUser, auth.loading, router, pathname]);

  return null;
}
