import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Smartphone, Send, Store, Wallet, Shield, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary-foreground font-bold text-xl tracking-tight">
            <div className="h-9 w-9 rounded-lg bg-primary-foreground/15 backdrop-blur grid place-items-center">
              <Smartphone className="h-5 w-5" />
            </div>
            M-PESA Lite
          </div>
          <nav className="flex items-center gap-3">
            {!loading && (user ? (
              <Button asChild variant="secondary"><Link to="/app">Open app</Link></Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><Link to="/auth">Sign in</Link></Button>
                <Button asChild variant="secondary"><Link to="/auth" search={{ mode: "signup" }}>Get started</Link></Button>
              </>
            ))}
          </nav>
        </div>

        <div className="mx-auto max-w-6xl px-6 pt-10 pb-24 grid lg:grid-cols-2 gap-10 items-center">
          <div className="text-primary-foreground">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 backdrop-blur px-3 py-1 text-xs font-medium">
              <Zap className="h-3 w-3" /> Powered by Safaricom Daraja API
            </span>
            <h1 className="mt-6 text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Mobile money,<br/>built for Kenya.
            </h1>
            <p className="mt-5 text-lg text-primary-foreground/80 max-w-md">
              Send money, pay Till & Paybill, withdraw at agents and top up your wallet with real M-Pesa STK Push.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg" variant="secondary" className="font-semibold">
                <Link to="/auth" search={{ mode: "signup" }}>Open free account</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                <Link to="/auth">I have an account</Link>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto">
            <div className="absolute inset-0 -m-6 rounded-[3rem] bg-primary-foreground/10 backdrop-blur-xl" />
            <div className="relative rounded-[2.5rem] bg-card text-card-foreground p-6 w-[300px] shadow-2xl border-8 border-foreground/20">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                <span>9:41</span><span>📶 5G 100%</span>
              </div>
              <div className="rounded-2xl p-4 text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                <p className="text-xs opacity-80">M-PESA Balance</p>
                <p className="text-3xl font-bold mt-1">KSh 24,500</p>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-5 text-[11px]">
                {[
                  { icon: Send, label: "Send" },
                  { icon: Wallet, label: "Withdraw" },
                  { icon: Smartphone, label: "Airtime" },
                  { icon: Store, label: "Lipa" },
                  { icon: Shield, label: "M-Shwari" },
                  { icon: Zap, label: "Fuliza" },
                ].map((it) => (
                  <div key={it.label} className="flex flex-col items-center gap-1.5 rounded-lg bg-muted p-2.5">
                    <it.icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{it.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you'd expect from M-Pesa</h2>
        <p className="mt-3 text-muted-foreground max-w-2xl">A working clone with real Safaricom Daraja integration for STK Push deposits, C2B confirmations and B2C withdrawals.</p>

        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {[
            { icon: Send, title: "Send Money", body: "Transfer instantly to any user on the platform." },
            { icon: Store, title: "Lipa na M-Pesa", body: "Pay merchants with Till numbers or Paybill + account." },
            { icon: Wallet, title: "Withdraw at Agent", body: "Cash out from registered agents with float." },
            { icon: Smartphone, title: "Top Up via STK Push", body: "Deposit real M-Pesa money into your wallet." },
            { icon: Shield, title: "PIN Protected", body: "Every transaction confirmed with your secret PIN." },
            { icon: Zap, title: "Real-time Statement", body: "See every shilling move with full transaction history." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="h-10 w-10 rounded-lg grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-lg">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground flex justify-between flex-wrap gap-3">
          <span>© {new Date().getFullYear()} M-Pesa Lite — demo using Safaricom Daraja sandbox</span>
          <span>Not affiliated with Safaricom PLC</span>
        </div>
      </footer>
    </div>
  );
}
