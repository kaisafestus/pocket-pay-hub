import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PinDialog } from "@/components/mpesa/PinDialog";
import { payTill, payBill, sendMoney, lookupPhone } from "@/server/wallet.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatKES , errMsg} from "@/lib/format";

export const Route = createFileRoute("/app/lipa")({ component: LipaPage });

function LipaPage() {
  return (
    <div className="min-h-screen">
      <AppHeader title="Lipa na M-PESA" subtitle="Pay businesses with Till or Paybill" />
      <div className="mx-auto max-w-md px-5 -mt-6">
        <div className="rounded-2xl bg-card border p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <Tabs defaultValue="till">
            <TabsList className="grid grid-cols-3 w-full mb-5">
              <TabsTrigger value="till">Buy Goods (Till)</TabsTrigger>
              <TabsTrigger value="paybill">Pay Bill</TabsTrigger>
              <TabsTrigger value="pochi">Pochi la Biashara</TabsTrigger>
            </TabsList>
            <TabsContent value="till"><TillForm /></TabsContent>
            <TabsContent value="paybill"><PaybillForm /></TabsContent>
            <TabsContent value="pochi"><PochiForm /></TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function TillForm() {
  const [till, setTill] = useState(""); const [amount, setAmount] = useState(""); const [open, setOpen] = useState(false);
  const fn = useServerFn(payTill); const qc = useQueryClient(); const nav = useNavigate();
  const amt = parseFloat(amount) || 0; const valid = till.length >= 4 && amt > 0;

  const onConfirm = async (pin: string) => {
    try {
      const r = await fn({ data: { till, amount: amt, pin } });
      toast.success(`Paid ${formatKES(amt)} to ${r.business}`);
      await qc.invalidateQueries(); setOpen(false); nav({ to: "/app" });
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>Till number</Label><Input value={till} onChange={(e) => setTill(e.target.value)} placeholder="e.g. 5566778" inputMode="numeric" /></div>
      <div className="space-y-1.5"><Label>Amount (KES)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="0" /></div>
      <PinDialog open={open} onOpenChange={setOpen}
        trigger={<Button className="w-full" size="lg" disabled={!valid}>Pay {amt > 0 && formatKES(amt)}</Button>}
        title="Confirm Payment" summary={<>Pay <b>{formatKES(amt)}</b> to till <b>{till}</b>.</>} onConfirm={onConfirm} />
    </div>
  );
}

function PaybillForm() {
  const [paybill, setPb] = useState(""); const [account, setAcc] = useState(""); const [amount, setAmount] = useState(""); const [open, setOpen] = useState(false);
  const fn = useServerFn(payBill); const qc = useQueryClient(); const nav = useNavigate();
  const amt = parseFloat(amount) || 0; const valid = paybill.length >= 4 && account.length > 0 && amt > 0;

  const onConfirm = async (pin: string) => {
    try {
      const r = await fn({ data: { paybill, account, amount: amt, pin } });
      toast.success(`Paid ${formatKES(amt)} to ${r.business}`);
      await qc.invalidateQueries(); setOpen(false); nav({ to: "/app" });
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label>Business / Paybill number</Label><Input value={paybill} onChange={(e) => setPb(e.target.value)} placeholder="e.g. 888880" inputMode="numeric" /></div>
      <div className="space-y-1.5"><Label>Account number</Label><Input value={account} onChange={(e) => setAcc(e.target.value)} placeholder="Meter number / phone / account ID" /></div>
      <div className="space-y-1.5"><Label>Amount (KES)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="0" /></div>
      <PinDialog open={open} onOpenChange={setOpen}
        trigger={<Button className="w-full" size="lg" disabled={!valid}>Pay {amt > 0 && formatKES(amt)}</Button>}
        title="Confirm Payment" summary={<>Pay <b>{formatKES(amt)}</b> to paybill <b>{paybill}</b>, account <b>{account}</b>.</>} onConfirm={onConfirm} />
    </div>
  );
}