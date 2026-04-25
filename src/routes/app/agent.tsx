import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { agentDeposit } from "@/server/wallet.functions";
import { toast } from "sonner";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/_app/agent")({ component: AgentDashboard });

function AgentDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fn = useServerFn(agentDeposit);
  const [phone, setPhone] = useState(""); const [amount, setAmount] = useState("");

  const { data: agent } = useQuery({
    queryKey: ["agent", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("agents").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: ops } = useQuery({
    queryKey: ["agent-ops", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").in("type", ["deposit_agent", "withdraw_agent"]).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  const amt = parseFloat(amount) || 0;
  const submit = async () => {
    try {
      const r = await fn({ data: { customerPhone: phone, amount: amt } });
      toast.success(`Deposited ${formatKES(amt)} to ${r.customer}`);
      setPhone(""); setAmount(""); qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="min-h-screen">
      <AppHeader title="Agent Dashboard" subtitle={agent ? `#${agent.agent_number} • ${agent.store_name}` : ""} />
      <div className="mx-auto max-w-md px-5 -mt-6 space-y-4">
        <div className="rounded-3xl p-6 text-primary-foreground" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}>
          <p className="text-xs opacity-80">Float Balance</p>
          <p className="text-3xl font-bold tabular-nums">{formatKES(Number(agent?.float_balance ?? 0))}</p>
        </div>

        <div className="rounded-2xl bg-card border p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <h2 className="font-semibold">Deposit cash for customer</h2>
          <div className="space-y-1.5"><Label>Customer phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" /></div>
          <div className="space-y-1.5"><Label>Amount (KES)</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" /></div>
          <Button className="w-full" disabled={!phone || amt <= 0} onClick={submit}>Confirm Deposit</Button>
        </div>

        <div className="rounded-2xl bg-card border p-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <h3 className="font-semibold mb-2">Recent operations</h3>
          {!ops || ops.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No agent operations yet</p>
          ) : (
            <ul className="divide-y">
              {ops.map((t) => (
                <li key={t.id} className="py-2 flex justify-between text-sm">
                  <div>
                    <p className="font-medium">{t.type === "deposit_agent" ? "Deposit" : "Withdrawal"}</p>
                    <p className="text-xs text-muted-foreground">{t.recipient_phone ?? t.account_ref ?? t.ref_code}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatKES(Number(t.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}