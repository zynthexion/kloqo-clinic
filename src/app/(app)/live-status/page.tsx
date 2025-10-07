
"use client";

import Link from "next/link";
import { LiveStatusHeader } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { Maximize, ZoomIn, ZoomOut, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/firebase";
import type { Doctor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const DoctorStatusCard = ({ data }: { data: Doctor }) => (
  <Link href={`/live-status/${data.id}`}>
    <Card
      className={cn(
        "p-4 flex flex-col justify-between h-full shadow-md hover:shadow-xl transition-shadow",
        data.availability === "Available" ? "bg-blue-50" : "bg-red-50"
      )}
    >
      <div>
        <h3 className="font-semibold text-lg">{data.name}</h3>
        <p className="text-sm text-muted-foreground">{data.specialty}</p>
      </div>
      <div className="mt-4">
        {data.availability === "Available" ? (
          <>
            <p className="text-green-600 font-bold text-xl">
              Available
            </p>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> 
                <span>{data.todaysAppointments || 0} appointments today</span>
            </div>
          </>
        ) : (
          <>
            <p className="text-red-500 font-bold text-xl">UNAVAILABLE</p>
            <p className="text-sm text-muted-foreground">
              Currently not accepting appointments.
            </p>
          </>
        )}
      </div>
    </Card>
  </Link>
);

const ZoomControls = () => (
  <div className="fixed right-6 bottom-6 flex flex-col gap-1">
    <Card className="p-0 flex flex-col gap-0 rounded-md overflow-hidden border">
        <Button variant="ghost" size="icon" className="rounded-none">
            <ZoomIn className="h-5 w-5" />
        </Button>
        <hr />
        <Button variant="ghost" size="icon" className="rounded-none">
            <ZoomOut className="h-5 w-5" />
        </Button>
        <hr />
        <Button variant="ghost" size="icon" className="rounded-none">
            <Maximize className="h-5 w-5" />
        </Button>
    </Card>
  </div>
);

export default function LiveStatusPage() {
  const auth = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
      if (!auth.currentUser) return;
      const fetchDoctors = async () => {
          setLoading(true);
          try {
              const userDoc = await getDoc(doc(db, "users", auth.currentUser!.uid));
              const clinicId = userDoc.data()?.clinicId;

              if (clinicId) {
                const q = query(collection(db, "doctors"), where("clinicId", "==", clinicId));
                const querySnapshot = await getDocs(q);
                const doctorsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Doctor));
                setDoctors(doctorsList);
              }
          } catch (error) {
              console.error("Error fetching doctors for live status: ", error);
          } finally {
              setLoading(false);
          }
      }
      fetchDoctors();
  }, [auth.currentUser]);

  return (
    <>
      <div className="flex flex-col">
        <LiveStatusHeader />
        <main className="flex-1 p-4 sm:p-6 relative">
          {loading ? (
            <p>Loading doctors...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {doctors.map((doctor) => (
                    <DoctorStatusCard key={doctor.id} data={doctor} />
                ))}
            </div>
          )}
          <ZoomControls />
        </main>
      </div>
    </>
  );
}
