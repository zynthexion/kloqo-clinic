
"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, MessageSquare, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SendLinkDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  phoneNumber: string;
};

export function SendLinkDialog({ isOpen, setIsOpen, phoneNumber }: SendLinkDialogProps) {
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [number, setNumber] = useState(phoneNumber);
  const [message, setMessage] = useState(
    "Your appointment is confirmed. View details and get directions here: [Booking Link]"
  );
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    setNumber(phoneNumber);
  }, [phoneNumber, isOpen]);

  const handleSend = () => {
    if (number.length < 10) {
      toast({
        variant: "destructive",
        title: "Invalid Phone Number",
        description: "Please enter a valid 10-digit phone number.",
      });
      return;
    }

    startTransition(async () => {
        try {
            const response = await fetch('/api/send-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: `+91${number}`,
                    message: message,
                    channel: channel
                }),
            });

            const result = await response.json();
    
            if (!response.ok) {
                throw new Error(result.error || `Failed to send ${channel} message.`);
            }
    
            toast({
                title: `${channel === 'sms' ? 'SMS' : 'WhatsApp'} Sent`,
                description: `Message sent to +91${number}.`,
            });
            setIsOpen(false);
        } catch (error: any) {
            console.error(`Error sending ${channel}:`, error);
            toast({
                variant: "destructive",
                title: `Failed to Send ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`,
                description: error.message || "An unexpected error occurred.",
            });
        }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Booking Link</DialogTitle>
          <DialogDescription>
            Send a booking confirmation link to the patient.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="channel">Channel</Label>
            <RadioGroup
              id="channel"
              value={channel}
              onValueChange={(value) => setChannel(value as "sms" | "whatsapp")}
              className="flex gap-4"
            >
              <Label
                htmlFor="sms"
                className="flex items-center gap-2 border p-3 rounded-md cursor-pointer flex-1 has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:border-primary"
              >
                <RadioGroupItem value="sms" id="sms" />
                <MessageSquare className="h-5 w-5" /> SMS
              </Label>
              <Label
                htmlFor="whatsapp"
                className="flex items-center gap-2 border p-3 rounded-md cursor-pointer flex-1 has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:border-primary"
              >
                <RadioGroupItem value="whatsapp" id="whatsapp" />
                <Smartphone className="h-5 w-5" /> WhatsApp
              </Label>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+91</span>
              <Input
                id="phone"
                type="tel"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit number"
                className="pl-10"
                maxLength={10}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSend} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Send {channel === 'sms' ? 'SMS' : 'WhatsApp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
