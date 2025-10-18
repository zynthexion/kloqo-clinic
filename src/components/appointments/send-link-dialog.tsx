
"use client";

import { useState, useEffect, useTransition } from "react";
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
import { Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SendLinkDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  phoneNumber?: string;
};

export function SendLinkDialog({ isOpen, setIsOpen, phoneNumber }: SendLinkDialogProps) {
  const [phone, setPhone] = useState(phoneNumber || "");
  const [message, setMessage] = useState("Your clinic appointment booking link is: [LINK]");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    setPhone(phoneNumber || "");
  }, [phoneNumber, isOpen]);

  const handleSend = () => {
    if (phone.length < 10) {
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
            to: `+91${phone}`,
            message,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send SMS.');
        }

        toast({
          title: "SMS Sent Successfully",
          description: `Message sent to +91${phone}.`,
        });
        setIsOpen(false);
      } catch (error: any) {
        console.error("Error sending SMS:", error);
        toast({
          variant: "destructive",
          title: "Failed to Send SMS",
          description: error.message || "An error occurred. Please check server logs.",
        });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Booking Link via SMS</DialogTitle>
          <DialogDescription>
            Share the appointment booking link with the patient via a centralized SMS number.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phone" className="text-right">
              Phone
            </Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="col-span-3"
              placeholder="10-digit number"
              maxLength={10}
            />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="message" className="text-right pt-2">
              Message
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="col-span-3"
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
