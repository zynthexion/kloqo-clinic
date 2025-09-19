
"use client"

import { useParams } from "next/navigation";
import { SidebarInset } from "@/components/ui/sidebar";
import { LiveStatusDetailHeader } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { liveStatuses } from "@/lib/data";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";

// Dummy data for token details
const generateTokens = (prefix: string, count: number, start: number) => {
    return Array.from({ length: count }, (_, i) => `${prefix}00${start + i}`);
}

const completedTokens = generateTokens('A', 2, 1);
const pendingTokens = generateTokens('A', 5, 3);
const missedTokens = generateTokens('A', 1, 8);


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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-300px)]">
            <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-600">
                        <CheckCircle size={20} /> Completed Tokens
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="space-y-2">
                        {completedTokens.map(token => (
                            <Badge key={token} variant="success" className="text-base font-medium mr-2 mb-2 p-2">{token}</Badge>
                        ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
            <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-yellow-600">
                        <Clock size={20} /> Pending Tokens
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow overflow-hidden">
                     <ScrollArea className="h-full">
                        <div className="space-y-2">
                        {pendingTokens.map(token => (
                             <Badge key={token} variant="warning" className="text-base font-medium mr-2 mb-2 p-2">{token}</Badge>
                        ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
            <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                        <AlertCircle size={20} /> Missed Tokens
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow overflow-hidden">
                     <ScrollArea className="h-full">
                        <div className="space-y-2">
                        {missedTokens.map(token => (
                            <Badge key={token} variant="danger" className="text-base font-medium mr-2 mb-2 p-2">{token}</Badge>
                        ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
      </main>
    </SidebarInset>
  );
}
