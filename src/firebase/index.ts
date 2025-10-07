
"use client";

import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { useEffect, useState } from 'react';

export const firestore = db;

export function useAuth() {
    const [user, setUser] = useState<FirebaseUser | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
        });

        return () => unsubscribe();
    }, []);

    return { ...auth, currentUser: user };
}
