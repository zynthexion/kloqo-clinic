
"use client";

import { useState, useEffect } from "react";
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
import { Send, MessageSquare, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SendLinkDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  phoneNumber?: string;
};

export function SendLinkDialog({ isOpen, setIsOpen, phoneNumber }: SendLinkDialogProps) {
  const [phone, setPhone] = useState(phoneNumber || "");
  const [message, setMessage] = useState("Your clinic appointment booking link is: [LINK]");
  const [method, setMethod] = useState<"sms" | "whatsapp">("sms");
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

    const fullPhoneNumber = `+91${phone}`;
    const encodedMessage = encodeURIComponent(message);
    let url = "";

    if (method === "whatsapp") {
      url = `https://wa.me/${fullPhoneNumber.replace("+", "")}?text=${encodedMessage}`;
    } else {
      url = `sms:${fullPhoneNumber}?body=${encodedMessage}`;
    }

    window.open(url, "_blank");
    toast({
      title: "Action Initiated",
      description: `Your ${method === "sms" ? "SMS" : "WhatsApp"} application should open to send the message.`,
    });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Booking Link</DialogTitle>
          <DialogDescription>
            Share the appointment booking link with the patient via SMS or WhatsApp.
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
           <div className="grid grid-cols-4 items-center gap-4">
             <Label className="text-right">Method</Label>
             <RadioGroup defaultValue="sms" className="col-span-3 flex gap-4" onValueChange={(value: "sms" | "whatsapp") => setMethod(value)}>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sms" id="r1" />
                    <Label htmlFor="r1" className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> SMS</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <RadioGroupItem value="whatsapp" id="r2" />
                    <Label htmlFor="r2" className="flex items-center gap-2">
                       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19.05 4.94A9.91 9.91 0 0 0 12 2C6.5 2 2 6.5 2 12s4.5 10 10 10h.01c5.5 0 10-4.5 10-10c0-2.76-1.12-5.26-2.96-7.06zM16.5 15.3c-.33.12-.74.2-1.13.12c-.32-.08-.57-.2-.74-.36c-.17-.16-.32-.38-.45-.63c-.13-.25-.26-.54-.39-.85c-.13-.3-.29-.58-.46-.83s-.36-.48-.56-.68c-.2-.2-.42-.36-.67-.48c-.25-.12-.52-.2-.81-.22c-.3-.02-.58.02-.84.12c-.26.1-.5.25-.7.45s-.35.42-.45.68c-.1.25-.16.52-.18.8c-.02.28.01.55.1.78c.1.23.23.45.4.65l.07.08c.16.18.35.37.58.58l.12.1c.25.22.53.46.83.73c.3.27.6.58.9.9c.3.33.58.6.83.81c.25.2.48.35.68.45c.2.1.4.16.6.18c.2.02.4-.01.58-.08c.18-.07.36-.18.52-.33c.16-.15.28-.3.36-.45c.08-.15.13-.3.15-.43c.02-.13 0-.25-.05-.36c-.05-.11-.12-.22-.22-.3s-.2-.15-.3-.18c-.1-.03-.2-.03-.3 0c-.1.02-.2.05-.28.1c-.08.05-.15.1-.2.13c-.05.03-.1.07-.12.1c-.03.04-.03.05-.03.05s0 .01 0 0c-.08.07-.22.04-.38-.03c-.16-.07-.44-.2-1.03-.48c-.6-.28-1.13-.7-1.55-1.23c-.1-.13-.2-.26-.28-.4c-.08-.14-.15-.28-.2-.43c-.05-.15-.1-.3-.12-.44c-.03-.14-.03-.27 0-.4c.03-.13.08-.25.15-.36c.07-.1.16-.2.26-.26c.1-.06.2-.1.3-.13c.1-.03.2-.04.3-.02c.1.02.2.06.28.13c.08.07.15.15.22.25c.07.1.12.2.15.3c.03.1.05.2.05.28c0 .08-.02.16-.05.23c-.03.07-.08.14-.13.2c-.05.06-.12.13-.2.2c-.08.07-.15.13-.22.17c-.07.04-.12.08-.15.1c0 0-.01 0-.01.02h0c0 .01.02.03.03.03c.01.01.03.01.06.01c.03 0 .07-.01.1-.02c.17-.05.6-.25 1.18-.53c.58-.28 1.1-.68 1.55-1.2c.45-.52.75-1.13.88-1.8c.03-.15.05-.3.05-.44s-.01-.28-.05-.42a.93.93 0 0 0-.2-.36c-.1-.1-.2-.2-.34-.28c-.14-.08-.3-.13-.45-.16c-.15-.03-.3-.04-.44-.02c-.14.02-.28.05-.4.1c-.13.05-.25.1-.36.17c-.1.07-.2.15-.28.23c-.08.08-.15.17-.2.26c-.05.09-.1.2-.12.3c-.02.1-.03.2-.03.3c.01.2.05.4.13.58c.08.18.2.35.33.5c.14.15.3.3.46.45c.16.15.34.3.5.43c.17.13.35.25.5.36c.16.1.3.2.45.26c.15.06.3.1.44.13c.14.03.28.04.4.03c.12,0,.24-.01.36-.05Z"/></svg>
                        WhatsApp
                    </Label>
                </div>
            </RadioGroup>
           </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSend}>
            <Send className="mr-2 h-4 w-4" /> Send Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
