
"use client";

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/firebase';

export function OnboardingCheck() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!auth.currentUser || pathname === '/onboarding' || auth.loading) return;

    const checkOnboardingStatus = async () => {
      try {
        const userDocRef = doc(db, "users", auth.currentUser!.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const clinicId = userDoc.data()?.clinicId;
          
          // If there's no clinicId, user must onboard.
          if (!clinicId) {
            router.push('/onboarding');
            return;
          }

          // Check if at least one department exists for the clinic
          const departmentsQuery = query(collection(db, "departments"), where("clinicId", "==", clinicId));
          const departmentsSnapshot = await getDocs(departmentsQuery);
          
          // Check if at least one doctor exists for the clinic
          const doctorsQuery = query(collection(db, "doctors"), where("clinicId", "==", clinicId));
          const doctorsSnapshot = await getDocs(doctorsQuery);

          const needsOnboarding = departmentsSnapshot.empty || doctorsSnapshot.empty;

          if (needsOnboarding) {
            router.push('/onboarding');
          }
        } else {
          // If user document doesn't exist, they need to onboard.
          router.push('/onboarding');
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        // Optional: redirect to an error page or show a toast
      }
    };

    // A short delay to allow other startup processes to complete.
    const timer = setTimeout(() => {
        checkOnboardingStatus();
    }, 500);
    
    return () => clearTimeout(timer);

  }, [auth.currentUser, auth.loading, router, pathname]);

  return null; // This component does not render anything
}
