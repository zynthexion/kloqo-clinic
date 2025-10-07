
"use client";

import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import React, { useEffect, useState, useContext, ReactNode } from 'react';
import { AuthContext } from '@/firebase';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    const value = {
        currentUser,
        loading,
    };

    // Render children only when not loading to prevent flicker or premature rendering of protected content
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
