import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { Banknote, PiggyBank, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/loans")({ component: LoansPage });

function LoansPage() {
  return (
    <div className="min-h-screen">
      <AppHeader title="Loans & Savings" subtitle="Fuliza, M-Shwari, KCB M-PESA" />
      <div className="mx-auto max-w-md px-5 -mt-6 space-y-4">
        {[
          { icon: Banknote, name: "Fuliza", desc: "Overdraft when you have insufficient balance" },
          { icon: PiggyBank, name: "M-Shwari", desc: "Save and earn interest, borrow loans" },
          { icon: TrendingUp, name: "KCB M-PESA", desc: "Larger loans with KCB Bank" },
        ].map((s) => (
          <div key={s.name} className="rounded-2xl bg-card border p-5 flex gap-4 items-start" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="h-11 w-11 rounded-xl grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
              <s.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">{s.name}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
              <p className="text-xs mt-2 text-warning-foreground bg-warning/30 inline-block px-2 py-0.5 rounded">Coming soon</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}