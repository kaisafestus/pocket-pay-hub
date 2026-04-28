import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PinDialog } from "@/components/mpesa/PinDialog";
import { sendMoney, lookupPhone } from "@/server/wallet.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatKES , errMsg} from "@/lib/format";
import { Loader2, CheckCircle2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/send")({ component: SendPage });

function SendPage() {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [open, setOpen] = useState(false);
  const send = useServerFn(sendMoney);
  const lookup = useServerFn(lookupPhone);
  const qc = useQueryClient();
  const nav = useNavigate();

  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<null | {
    phone: string;
    name: string | null;
    registered: boolean;
    carrier: string | null;
    country: string | null;
    international: string | null;
  }>(null);

  const amt = parseFloat(amount) || 0;
  const phoneReady = phone.replace(/\D/g, "").length >= 9;
  const canSend = !!verified && amt > 0;

  const onVerify = async () => {
    setVerifying(true);
    try {
      const r = await lookup({ data: { phone } });
      if (r.isSelf) {
        toast.error("You can't send money to yourself");
        setVerified(null);
        return;
      }
      setVerified({
        phone: r.phone,
        name: r.name,
        registered: r.registered,
        carrier: r.carrier,
        country: r.country,
        international: r.international,
      });
    } catch (e) {
      toast.error(errMsg(e));
      setVerified(null);
    } finally {
      setVerifying(false);
    }
  };

  const onConfirm = async (pin: string) => {
    try {
      const r = await send({ data: { phone, amount: amt, description: desc, pin } });
      toast.success(`Sent ${formatKES(amt)} successfully`);
      setOpen(false);
      void r;
      await qc.invalidateQueries();
      nav({ to: "/app" });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader title="Send Money" subtitle="Transfer to another M-PESA user" />
      <div className="mx-auto max-w-md px-5 -mt-6">
        <div className="rounded-2xl bg-card border p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="space-y-1.5">
            <Label>Recipient phone</Label>
            <div className="flex gap-2">
              <Input
                placeholder="0712 345 678"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setVerified(null); }}
                type="tel"
                inputMode="tel"
              />
              <Button type="button" variant="secondary" onClick={onVerify} disabled={!phoneReady || verifying}>
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </Button>
            </div>
            {verified && (
              <div className="mt-2 rounded-xl border p-3 text-sm flex items-start gap-2 bg-primary/5 border-primary/30">
                {verified.registered ? <CheckCircle2 className="h-5 w-5 text-primary shrink-0" /> : <ShieldCheck className="h-5 w-5 text-primary shrink-0" />}
                <div className="space-y-0.5">
                  <p className="font-semibold">{verified.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {verified.international || verified.phone}
                    {verified.carrier ? ` • ${verified.carrier}` : ""}
                    {verified.country ? ` • ${verified.country}` : ""}
                  </p>
                </div>
              </div>
            )}
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
            trigger={<Button className="w-full" size="lg" disabled={!canSend}>Send {amt > 0 && formatKES(amt)}</Button>}
            title="Confirm Send Money"
            summary={<>You are sending <b>{formatKES(amt)}</b> to <b>{verified?.name ?? phone}</b> ({verified?.international ?? phone}).</>}
            onConfirm={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}