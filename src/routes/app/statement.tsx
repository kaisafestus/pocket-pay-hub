import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatKES, timeAgo } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { requestReversal } from "@/server/wallet.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/app/statement")({ component: StatementPage });

function StatementPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const reverse = useServerFn(requestReversal);

  const { data: txns } = useQuery({
    queryKey: ["all-txns", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  const handleReverse = async (id: string) => {
    if (!confirm("Reverse this transaction? Money will be returned to your wallet.")) return;
    try {
      await reverse({ data: { txnId: id } });
      toast.success("Transaction reversed");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="min-h-screen">
      <AppHeader title="Mini Statement" subtitle="Last 100 transactions" />
      <div className="mx-auto max-w-md px-5 -mt-6">
        <div className="rounded-2xl bg-card border p-2" style={{ boxShadow: "var(--shadow-card)" }}>
          {!txns || txns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No transactions yet.</p>
          ) : (
            <ul className="divide-y">
              {txns.map((t) => {
                const incoming = t.recipient_id === user?.id || ["deposit_agent", "mpesa_topup"].includes(t.type);
                const isMine = t.sender_id === user?.id;
                const reversible = isMine && t.status === "completed" && ["send_money", "pay_till", "pay_bill"].includes(t.type);
                return (
                  <li key={t.id} className="py-3 px-2 flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-full grid place-items-center shrink-0", incoming ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                      {incoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.description ?? t.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {timeAgo(t.created_at)} • {t.ref_code} • <span className={cn(t.status === "completed" ? "text-success" : t.status === "reversed" ? "text-warning-foreground" : "")}>{t.status}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-semibold tabular-nums", incoming ? "text-success" : "")}>
                        {incoming ? "+" : "-"}{formatKES(Number(t.amount))}
                      </p>
                      {reversible && (
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => handleReverse(t.id)}>
                          <Undo2 className="h-3 w-3 mr-1" />Reverse
                        </Button>
                      )}
                    </div>
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