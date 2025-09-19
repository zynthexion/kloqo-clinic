
"use client";

import Link from "next/link";
import { LiveStatusHeader } from "@/components/layout/header";
import { SidebarInset } from "@/components/ui/sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { liveStatuses } from "@/lib/data";
import type { LiveStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";

const DoctorStatusCard = ({ data }: { data: LiveStatus }) => (
  <Link href={`/live-status/${data.id}`}>
    <Card
      className={cn(
        "p-4 flex flex-col justify-between border-2 h-full hover:shadow-lg transition-shadow",
        data.status === "available" ? "border-blue-400 hover:border-blue-500" : "border-red-500 hover:border-red-600"
      )}
    >
      <div>
        <h3 className="font-semibold text-lg">{`${data.doctorName} - ${data.specialty}`}</h3>
        <p className="text-sm text-muted-foreground">Room {data.room}</p>
      </div>
      <div className="mt-4">
        {data.status === "available" ? (
          <>
            <p className="text-green-600 font-bold text-xl">
              Current: {data.currentToken}
            </p>
            <p className="text-sm text-muted-foreground">
              Queue: {data.queue} patients
            </p>
          </>
        ) : (
          <>
            <p className="text-red-500 font-bold text-xl">BREAK</p>
            <p className="text-sm text-muted-foreground">
              Returns: {data.returnTime}
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
  return (
    <SidebarInset>
      <LiveStatusHeader />
      <main className="flex-1 p-4 sm:p-6 relative">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {liveStatuses.map((status) => (
            <DoctorStatusCard key={status.id} data={status} />
          ))}
        </div>
        <ZoomControls />
      </main>
    </SidebarInset>
  );
}
