import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { stkPush, checkTopupStatus } from "@/server/daraja.functions";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Smartphone } from "lucide-react";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/app/topup")({ component: TopUpPage });

function TopUpPage() {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const push = useServerFn(stkPush);
  const check = useServerFn(checkTopupStatus);
  const qc = useQueryClient();

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      try {
        const r = await check({ data: { checkoutRequestId: pending } });
        if (r.status === "completed") {
          toast.success(`Top up of ${formatKES(Number(r.amount))} received!`);
          setPending(null); qc.invalidateQueries();
        } else if (r.status === "failed") {
          toast.error("Top up failed or cancelled");
          setPending(null);
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(id);
  }, [pending, check, qc]);

  const submit = async () => {
    const amt = parseInt(amount, 10);
    if (!phone || !amt) return;
    setBusy(true);
    try {
      const r = await push({ data: { phone, amount: amt } });
      toast.success("STK Push sent — check your phone");
      setPending(r.checkoutRequestId ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen">
      <AppHeader title="Top Up Wallet" subtitle="Real M-PESA STK Push via Daraja" />
      <div className="mx-auto max-w-md px-5 -mt-6 space-y-4">
        <div className="rounded-2xl bg-card border p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="space-y-1.5"><Label>M-PESA phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" /></div>
          <div className="space-y-1.5"><Label>Amount (KES)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="1" /></div>
          <Button className="w-full" size="lg" onClick={submit} disabled={busy || !!pending}>
            {(busy || pending) && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Waiting for PIN entry…" : "Send STK Push"}
          </Button>
        </div>

        <div className="rounded-2xl bg-accent/40 border border-primary/20 p-4 flex gap-3">
          <Smartphone className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">How it works</p>
            <p>Tap "Send STK Push" — your phone will receive an M-PESA prompt. Enter your real M-PESA PIN to deposit money into your wallet. Sandbox shortcode <b>174379</b> works for testing.</p>
          </div>
        </div>
      </div>
    </div>
  );
}