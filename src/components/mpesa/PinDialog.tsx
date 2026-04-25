import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Props {
  trigger: ReactNode;
  title: string;
  summary: ReactNode;
  onConfirm: (pin: string) => Promise<void>;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}

export function PinDialog({ trigger, title, summary, onConfirm, open, onOpenChange }: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (pin.length !== 4) return;
    setBusy(true);
    try {
      await onConfirm(pin);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild><div className="text-sm text-muted-foreground">{summary}</div></DialogDescription>
        </DialogHeader>
        <div className="py-3 flex justify-center">
          <InputOTP maxLength={4} value={pin} onChange={setPin}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <p className="text-center text-xs text-muted-foreground -mt-2">Enter your 4-digit M-PESA PIN</p>
        <DialogFooter>
          <Button onClick={handle} disabled={pin.length !== 4 || busy} className="w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}