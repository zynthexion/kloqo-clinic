
"use client";

import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import React, { useEffect, useState, useContext, createContext } from 'react';

interface AuthContextType {
    currentUser: FirebaseUser | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    currentUser: null,
    loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const value = {
        currentUser,
        loading,
    };

    return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
}

export const useAuth = () => {
    return useContext(AuthContext);
};
