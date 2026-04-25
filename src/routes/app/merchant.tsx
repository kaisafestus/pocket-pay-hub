import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, timeAgo } from "@/lib/format";
import { Store } from "lucide-react";

export const Route = createFileRoute("/app/merchant")({ component: MerchantDashboard });

function MerchantDashboard() {
  const { user } = useAuth();
  const { data: merchants } = useQuery({
    queryKey: ["merchants-mine", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("merchants").select("*").eq("user_id", user!.id);
      return data ?? [];
    },
  });
  const { data: payments } = useQuery({
    queryKey: ["merchant-payments", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").in("type", ["pay_till", "pay_bill"]).eq("recipient_id", user!.id).order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  const total = (payments ?? []).reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="min-h-screen">
      <AppHeader title="Merchant Dashboard" subtitle="Track your incoming payments" />
      <div className="mx-auto max-w-md px-5 -mt-6 space-y-4">
        <div className="rounded-3xl p-6 text-primary-foreground" style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}>
          <p className="text-xs opacity-80">Total received</p>
          <p className="text-3xl font-bold tabular-nums">{formatKES(total)}</p>
        </div>

        {merchants?.map((m) => (
          <div key={m.id} className="rounded-2xl bg-card border p-4 flex items-center gap-3" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}><Store className="h-5 w-5" /></div>
            <div className="flex-1">
              <p className="font-semibold">{m.business_name}</p>
              <p className="text-xs text-muted-foreground">{m.type === "till" ? "Till" : "Paybill"} • {m.category ?? "—"}</p>
            </div>
            <span className="font-mono text-sm text-primary">#{m.shortcode}</span>
          </div>
        ))}

        <div className="rounded-2xl bg-card border p-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <h3 className="font-semibold mb-2">Recent payments</h3>
          {!payments || payments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No payments yet</p>
          ) : (
            <ul className="divide-y">
              {payments.map((p) => (
                <li key={p.id} className="py-2.5 flex justify-between">
                  <div>
                    <p className="text-sm font-medium">{p.account_ref ? `Account: ${p.account_ref}` : "Till payment"}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(p.created_at)} • {p.ref_code}</p>
                  </div>
                  <span className="text-sm font-semibold text-success tabular-nums">+{formatKES(Number(p.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}