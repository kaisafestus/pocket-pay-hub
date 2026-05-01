import { createFileRoute, Link } from "@tanstack/react-router";
import { BalanceCard } from "@/components/mpesa/BalanceCard";
import { Send, Wallet, Store, ShieldCheck, History, ArrowDownLeft, ArrowUpRight, Download, MessageSquare, Plus, Sun, Moon, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatKES, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useInstall } from "@/lib/pwa";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { topupWallet } from "@/server/wallet.functions";
import { toast } from "sonner";
import { errMsg } from "@/lib/format";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/app/")({ component: Dashboard });

const actions = [
  { to: "/app/send", label: "Send Money", icon: Send },
  { to: "/app/withdraw", label: "Withdraw", icon: Wallet },
  { to: "/app/lipa", label: "Lipa na M-PESA", icon: Store },
  { to: "/app/statement", label: "Statement", icon: History },
  { to: "/app/messages", label: "Messages", icon: MessageSquare },
  { to: "/app/account", label: "My Account", icon: ShieldCheck },
] as const;

function Dashboard() {
  const { user } = useAuth();
  const { canInstall, isInstalled, promptInstall } = useInstall();
  const { theme, toggle: toggleTheme } = useTheme();
  const qc = useQueryClient();
  const [iosOpen, setIosOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmt, setTopupAmt] = useState("");
  const [topupBusy, setTopupBusy] = useState(false);
  const topup = useServerFn(topupWallet);
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const { data: txns } = useQuery({
    queryKey: ["recent-txns", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
    refetchInterval: 6000,
  });

  const onTopup = async () => {
    const amt = parseFloat(topupAmt);
    if (!amt || amt <= 0) return;
    setTopupBusy(true);
    try {
      await topup({ data: { amount: amt } });
      toast.success(`Top-up of ${formatKES(amt)} successful`);
      setTopupOpen(false);
      setTopupAmt("");
      await qc.invalidateQueries();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setTopupBusy(false); }
  };

  return (
    <div>
      <div className="text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-md px-5 pt-6 pb-20 flex items-start justify-between">
          <div>
            <p className="text-sm opacity-80">Karibu,</p>
            <h1 className="text-xl font-semibold">M-PESA</h1>
          </div>
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="h-10 w-10 rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/25 grid place-items-center transition"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-md px-5 -mt-16 space-y-5">
        <BalanceCard />

        <div className="flex gap-3">
          <Button onClick={() => setTopupOpen(true)} className="flex-1" size="lg">
            <Plus className="h-4 w-4" /> Top up
          </Button>
          <Link to="/app/send" className="flex-1">
            <Button variant="secondary" size="lg" className="w-full">
              <Send className="h-4 w-4" /> Send
            </Button>
          </Link>
        </div>

        {!isInstalled && (
          <button
            onClick={() => {
              if (canInstall) void promptInstall();
              else setIosOpen(true);
            }}
            className="w-full flex items-center gap-3 rounded-2xl border border-primary/20 bg-accent/40 p-3 text-left hover:bg-accent/60 transition"
          >
            <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
              <Download className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Install M-PESA on your phone</p>
              <p className="text-xs text-muted-foreground">Add to home screen — works offline like a real app</p>
            </div>
          </button>
        )}

        <Dialog open={iosOpen} onOpenChange={setIosOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Install M-PESA</DialogTitle>
              <DialogDescription>Add M-PESA to your home screen in 3 steps:</DialogDescription>
            </DialogHeader>
            {isIOS ? (
              <ol className="list-decimal pl-5 text-sm space-y-2 text-foreground">
                <li>Tap the <b>Share</b> button in Safari (square with arrow).</li>
                <li>Scroll and tap <b>Add to Home Screen</b>.</li>
                <li>Tap <b>Add</b>. M-PESA will open like a native app.</li>
              </ol>
            ) : (
              <ol className="list-decimal pl-5 text-sm space-y-2 text-foreground">
                <li>Open the browser <b>menu</b> (⋮ in Chrome, ⋯ in Edge).</li>
                <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
                <li>Confirm <b>Install</b>. M-PESA will appear in your app drawer.</li>
              </ol>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Top up M-PESA</DialogTitle>
              <DialogDescription>Add funds to your M-PESA balance.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Amount (KES)</Label>
                <Input value={topupAmt} onChange={(e) => setTopupAmt(e.target.value)} type="number" inputMode="decimal" placeholder="0" autoFocus />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[500, 1000, 5000, 10000].map((v) => (
                  <button key={v} type="button" onClick={() => setTopupAmt(String(v))}
                    className="px-3 py-1.5 rounded-full border text-xs font-medium hover:bg-accent">
                    {formatKES(v)}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onTopup} disabled={topupBusy || !topupAmt} className="w-full">
                {topupBusy && <Loader2 className="h-4 w-4 animate-spin" />} Top up
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-3 gap-3">
          {actions.map((a) => (
            <Link key={a.to} to={a.to}
              className="flex flex-col items-center gap-2 rounded-2xl bg-card p-3 border hover:shadow-md transition"
              style={{ boxShadow: "var(--shadow-card)" }}>
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
            <p className="text-sm text-muted-foreground text-center py-6">No transactions yet.</p>
          ) : (
            <ul className="divide-y">
              {txns.map((t) => {
                const incoming = t.recipient_id === user?.id || ["deposit_agent", "mpesa_topup"].includes(t.type);
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