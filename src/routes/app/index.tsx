import { createFileRoute, Link } from "@tanstack/react-router";
import { BalanceCard } from "@/components/mpesa/BalanceCard";
import { Send, Wallet, Smartphone, Store, Receipt, Plus, Banknote, ShieldCheck, History, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

const actions = [
  { to: "/app/send", label: "Send Money", icon: Send },
  { to: "/app/withdraw", label: "Withdraw", icon: Wallet },
  { to: "/app/airtime", label: "Airtime", icon: Smartphone },
  { to: "/app/lipa", label: "Lipa na M-Pesa", icon: Store },
  { to: "/app/topup", label: "Top Up", icon: Plus },
  { to: "/app/statement", label: "Statement", icon: History },
  { to: "/app/loans", label: "Fuliza & Loans", icon: Banknote },
  { to: "/app/account", label: "My Account", icon: ShieldCheck },
] as const;

function Dashboard() {
  const { user } = useAuth();
  const { data: txns } = useQuery({
    queryKey: ["recent-txns", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    refetchInterval: 6000,
  });

  return (
    <div>
      <div className="text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-md px-5 pt-6 pb-20">
          <p className="text-sm opacity-80">Hello,</p>
          <h1 className="text-xl font-semibold">Welcome to M-PESA</h1>
        </div>
      </div>

      <div className="mx-auto max-w-md px-5 -mt-16 space-y-5">
        <BalanceCard />

        <div className="grid grid-cols-4 gap-3">
          {actions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex flex-col items-center gap-2 rounded-2xl bg-card p-3 border hover:shadow-md transition"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="h-11 w-11 rounded-xl grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                <a.icon className="h-5 w-5" />
              </div>
              <span className="text-[11px] text-center font-medium leading-tight">{a.label}</span>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl bg-card border p-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent Activity</h2>
            <Link to="/app/statement" className="text-xs text-primary font-medium">View all</Link>
          </div>
          {!txns || txns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions yet. Top up your wallet to begin.</p>
          ) : (
            <ul className="divide-y">
              {txns.map((t) => {
                const incoming = t.recipient_id === user?.id || ["deposit_agent", "mpesa_topup", "receive_money"].includes(t.type);
                return (
                  <li key={t.id} className="py-3 flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-full grid place-items-center", incoming ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                      {incoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.description ?? t.type}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(t.created_at)} • {t.ref_code}</p>
                    </div>
                    <span className={cn("text-sm font-semibold tabular-nums", incoming ? "text-success" : "")}>
                      {incoming ? "+" : "-"}{formatKES(Number(t.amount))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}