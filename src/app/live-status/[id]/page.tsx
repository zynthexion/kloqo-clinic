
"use client"

import { useParams } from "next/navigation";
import { SidebarInset } from "@/components/ui/sidebar";
import { LiveStatusDetailHeader } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { liveStatuses } from "@/lib/data";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";

// Dummy data for token details
const completedTokens = ["A001", "A002"];
const pendingTokens = ["A003", "A004", "A005", "A006", "A007"];
const missedTokens = ["A008"];

const allTokens = [
    ...completedTokens.map(token => ({ token, status: 'completed' })),
    ...pendingTokens.map(token => ({ token, status: 'pending' })),
    ...missedTokens.map(token => ({ token, status: 'missed' })),
];

const statusStyles = {
    completed: {
        variant: "success",
        icon: <CheckCircle size={16} className="mr-2" />,
        text: "Completed",
    },
    pending: {
        variant: "warning",
        icon: <Clock size={16} className="mr-2" />,
        text: "Pending",
    },
    missed: {
        variant: "danger",
        icon: <AlertCircle size={16} className="mr-2" />,
        text: "Missed",
    }
} as const;


export default function LiveStatusDetailPage() {
  const params = useParams();
  const { id } = params;

  const statusData = liveStatuses.find((s) => s.id === id);

  if (!statusData) {
    return (
      <SidebarInset>
        <LiveStatusDetailHeader />
        <main className="flex-1 p-4 sm:p-6 flex items-center justify-center">
            <p>Doctor not found.</p>
        </main>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset>
      <LiveStatusDetailHeader />
      <main className="flex-1 p-4 sm:p-6">
        <Card className="mb-6">
            <CardContent className="p-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold">{statusData.doctorName}</h2>
                        <p className="text-muted-foreground">{statusData.specialty}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-lg font-semibold">Room {statusData.room}</p>
                        <Badge variant={statusData.status === 'available' ? 'success' : 'destructive'}>
                            {statusData.status === 'available' ? 'Available' : 'On Break'}
                        </Badge>
                    </div>
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm text-muted-foreground">Current Token</p>
                        <p className="text-3xl font-bold text-green-600">{statusData.currentToken}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Patients in Queue</p>
                        <p className="text-3xl font-bold">{statusData.queue}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Token Queue Status</CardTitle>
                <CardDescription>Overview of all tokens for this queue.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[calc(100vh-420px)]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {allTokens.map(({ token, status }) => {
                            const style = statusStyles[status as keyof typeof statusStyles];
                            return (
                                <Badge key={token} variant={style.variant} className="text-base font-medium p-3 flex items-center justify-center">
                                    {style.icon}
                                    <span>{token}</span>
                                </Badge>
                            )
                        })}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>

      </main>
    </SidebarInset>
  );
}
