"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { UserPlus, LogOut, HeartPulse, RefreshCw } from 'lucide-react';
import type { Activity } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/firebase";

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'appointment_created': UserPlus,
  'appointment_completed': HeartPulse,
  'patient_discharged': LogOut,
  'patient_admitted': UserPlus,
  'doctor_added': UserPlus,
  'appointment_cancelled': LogOut,
};

const initialActivities: Activity[] = [
    {
      id: 'act-3',
      timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
      description: 'Vitals check for Jane Smith.',
      icon: HeartPulse
    },
    {
      id: 'act-2',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      description: 'Patient John Doe discharged from Room 201.',
      icon: LogOut
    },
    {
      id: 'act-1',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      description: 'New patient, Jane Smith, admitted.',
      icon: UserPlus
    },
];

export default function RecentActivity() {
  const [activities, setActivities] = React.useState<Activity[]>(initialActivities);
  const [isClient, setIsClient] = React.useState(false);
  const [loading, setLoading] = useState(false);
  const auth = useAuth();

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // Load activities from Firebase with localStorage fallback
  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchActivities = async () => {
      try {
        setLoading(true);

        // Try to load from Firebase first
        if (db) {
          const activitiesRef = collection(db, "activities");
          const q = query(
            activitiesRef,
            where("clinicId", "==", auth.currentUser?.uid || ""),
            orderBy("timestamp", "desc"),
            limit(10)
          );

          const unsubscribe = onSnapshot(q, (snapshot) => {
            const activitiesData = snapshot.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp,
                description: data.description || '',
                icon: activityIcons[data.type] || HeartPulse,
                type: data.type,
                source: 'firebase'
              };
            }) as Activity[];

            setActivities(activitiesData);
            setLoading(false);
          });

          return unsubscribe;
        }
      } catch (error) {
        console.error("❌ Firebase loading failed:", error);
      }

      // Fallback to localStorage if Firebase fails
      try {
        console.log("🔄 Loading activities from localStorage");
        const localActivitiesData = JSON.parse(localStorage.getItem('clinic-activities') || '[]');

        // Convert iconName back to icon component
        const localActivities = localActivitiesData.map((activity: any) => ({
          ...activity,
          icon: activityIcons[activity.iconName] || HeartPulse,
          source: 'localStorage'
        }));

        setActivities(localActivities.slice(0, 10)); // Show latest 10
        setLoading(false);
      } catch (localError) {
        console.error("❌ localStorage loading also failed:", localError);
        setLoading(false);
      }
    };

    fetchActivities();
  }, [auth.currentUser]);

  // Add a new activity with fallback to localStorage
  const addActivity = async (type: string, description: string, metadata?: any) => {
    if (!auth.currentUser) {
      console.error("No authenticated user for activity logging");
      return;
    }

    try {
      // Try Firebase first
      if (db) {
        const activityData = {
          type,
          description,
          clinicId: auth.currentUser.uid,
          timestamp: Timestamp.now(),
          metadata,
          iconName: type, // Store icon name for Firebase serialization
        };

        console.log("Adding activity to Firebase:", activityData);
        console.log("Icon component for display:", activityIcons[type]);

        const docRef = await addDoc(collection(db, "activities"), activityData);
        console.log("✅ Activity added to Firebase with ID:", docRef.id);
        return;
      }
    } catch (firebaseError) {
      console.error("❌ Firebase activity logging failed:", firebaseError);
      console.error("🔄 Falling back to localStorage");
    }

    // Fallback to localStorage if Firebase fails
    try {
      const localActivity = {
        id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        description,
        clinicId: auth.currentUser.uid,
        timestamp: new Date().toISOString(),
        metadata,
        iconName: type, // Store icon name instead of component
        source: 'localStorage'
      };

      // Get existing activities from localStorage
      const existingActivities = JSON.parse(localStorage.getItem('clinic-activities') || '[]');

      // Add new activity to the beginning
      existingActivities.unshift(localActivity);

      // Keep only last 50 activities
      const trimmedActivities = existingActivities.slice(0, 50);

      // Save back to localStorage
      localStorage.setItem('clinic-activities', JSON.stringify(trimmedActivities));

      console.log("✅ Activity added to localStorage:", localActivity);

      // Update the activities state to include the local activity (convert iconName to icon)
      const activityWithIcon = {
        ...localActivity,
        icon: activityIcons[localActivity.iconName] || HeartPulse
      };
      setActivities(prev => [activityWithIcon, ...prev.slice(0, 9)]); // Show latest 10

    } catch (localError) {
      console.error("❌ localStorage fallback also failed:", localError);
    }
  };

  // Example: Add activity when appointment is created
  const handleAddSampleActivity = () => {
    addActivity(
      'appointment_created',
      'New appointment scheduled for Dr. Smith',
      { doctorId: 'doc-123', patientId: 'pat-456' }
    );
  };

  const sortedActivities = React.useMemo(() => {
    return [...activities]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activities]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>A log of recent events.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden">
        <ScrollArea className="h-full">
            <div className="space-y-6">
            {loading ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                Loading activities...
              </div>
            ) : isClient && sortedActivities.length > 0 ? (
                sortedActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4">
                <div className="bg-muted rounded-full p-2">
                    <activity.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-grow">
                    <p className="text-sm">{activity.description}</p>
                    <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </p>
                </div>
                </div>
            ))
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No recent activities</p>
              </div>
            )}
            </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Export the addActivity function for use in other components
export const addActivity = async (type: string, description: string, metadata?: any) => {
  // We need to get the auth and setActivities from the component scope
  // This is a simplified version - in practice, this should be called from within the component
  console.warn('addActivity should be called from within the RecentActivity component context');
  return;
};
