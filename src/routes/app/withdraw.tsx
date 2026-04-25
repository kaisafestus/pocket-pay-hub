import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PinDialog } from "@/components/mpesa/PinDialog";
import { withdrawAtAgent } from "@/server/wallet.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/app/withdraw")({ component: WithdrawPage });

function WithdrawPage() {
  const [agentNumber, setAgent] = useState("");
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState(false);
  const fn = useServerFn(withdrawAtAgent);
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: agents } = useQuery({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const { data } = await supabase.from("agents").select("agent_number, store_name, location").order("store_name").limit(20);
      return data ?? [];
    },
  });

  const amt = parseFloat(amount) || 0;
  const valid = agentNumber.length >= 3 && amt > 0;

  const onConfirm = async (pin: string) => {
    try {
      await fn({ data: { agentNumber, amount: amt, pin } });
      toast.success(`Withdrawal of ${formatKES(amt)} approved. Collect cash from the agent.`);
      qc.invalidateQueries();
      setOpen(false);
      nav({ to: "/app" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader title="Withdraw Cash" subtitle="At any registered M-PESA agent" />
      <div className="mx-auto max-w-md px-5 -mt-6 space-y-4">
        <div className="rounded-2xl bg-card border p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="space-y-1.5">
            <Label>Agent number</Label>
            <Input placeholder="123456" value={agentNumber} onChange={(e) => setAgent(e.target.value)} inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (KES)</Label>
            <Input placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
          </div>
          <PinDialog
            open={open} onOpenChange={setOpen}
            trigger={<Button className="w-full" size="lg" disabled={!valid}>Withdraw {amt > 0 && formatKES(amt)}</Button>}
            title="Confirm Withdrawal"
            summary={<>Withdraw <b>{formatKES(amt)}</b> from agent <b>{agentNumber}</b>.</>}
            onConfirm={onConfirm}
          />
        </div>

        {agents && agents.length > 0 && (
          <div className="rounded-2xl bg-card border p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h3 className="text-sm font-semibold mb-2">Nearby agents</h3>
            <ul className="divide-y">
              {agents.map((a) => (
                <li key={a.agent_number}>
                  <button onClick={() => setAgent(a.agent_number)} className="w-full text-left py-2.5 flex justify-between items-center hover:bg-muted/50 rounded px-1">
                    <div>
                      <p className="text-sm font-medium">{a.store_name}</p>
                      <p className="text-xs text-muted-foreground">{a.location ?? "—"}</p>
                    </div>
                    <span className="text-xs font-mono text-primary">#{a.agent_number}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}