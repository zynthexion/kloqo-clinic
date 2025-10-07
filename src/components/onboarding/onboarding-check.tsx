
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
    if (!auth.currentUser) return;

    const checkOnboardingStatus = async () => {
      try {
        const userDocRef = doc(db, "users", auth.currentUser!.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const clinicId = userDoc.data()?.clinicId;
          if (!clinicId) return;

          const departmentsQuery = query(collection(db, 'departments'), where('clinicId', '==', clinicId));
          const doctorsQuery = query(collection(db, 'doctors'), where('clinicId', '==', clinicId));

          const [departmentsSnapshot, doctorsSnapshot] = await Promise.all([
            getDocs(departmentsQuery),
            getDocs(doctorsQuery),
          ]);

          const needsOnboarding = departmentsSnapshot.empty || doctorsSnapshot.empty;

          if (needsOnboarding && pathname !== '/onboarding') {
            router.push('/onboarding');
          }
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
      }
    };

    checkOnboardingStatus();
  }, [auth.currentUser, router, pathname]);

  return null; // This component does not render anything
}
