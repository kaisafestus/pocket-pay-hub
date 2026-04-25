import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PinDialog } from "@/components/mpesa/PinDialog";
import { sendMoney } from "@/server/wallet.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/app/send")({ component: SendPage });

function SendPage() {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [open, setOpen] = useState(false);
  const send = useServerFn(sendMoney);
  const qc = useQueryClient();
  const nav = useNavigate();

  const amt = parseFloat(amount) || 0;
  const valid = phone.replace(/\D/g, "").length >= 9 && amt > 0;

  const onConfirm = async (pin: string) => {
    try {
      const r = await send({ data: { phone, amount: amt, description: desc, pin } });
      toast.success(`Sent ${formatKES(amt)} successfully`);
      qc.invalidateQueries();
      setOpen(false);
      nav({ to: "/app" });
      void r;
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader title="Send Money" subtitle="Transfer to another M-PESA user" />
      <div className="mx-auto max-w-md px-5 -mt-6">
        <div className="rounded-2xl bg-card border p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="space-y-1.5">
            <Label>Recipient phone</Label>
            <Input placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (KES)</Label>
            <Input placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Input placeholder="Lunch, rent, etc." value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={120} />
          </div>

          <PinDialog
            open={open}
            onOpenChange={setOpen}
            trigger={<Button className="w-full" size="lg" disabled={!valid}>Send {amt > 0 && formatKES(amt)}</Button>}
            title="Confirm Send Money"
            summary={<>You are sending <b>{formatKES(amt)}</b> to <b>{phone}</b>.</>}
            onConfirm={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}