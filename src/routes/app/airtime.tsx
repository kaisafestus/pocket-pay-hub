import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { Smartphone } from "lucide-react";

export const Route = createFileRoute("/_app/airtime")({ component: AirtimePage });

function AirtimePage() {
  return (
    <div className="min-h-screen">
      <AppHeader title="Buy Airtime" subtitle="Top up any Safaricom number" />
      <div className="mx-auto max-w-md px-5 -mt-6">
        <div className="rounded-2xl bg-card border p-6 text-center space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="h-12 w-12 mx-auto rounded-full grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            <Smartphone className="h-6 w-6" />
          </div>
          <h2 className="font-semibold">Airtime not available via Daraja</h2>
          <p className="text-sm text-muted-foreground">
            Safaricom does not expose airtime purchase to third-party apps via the Daraja API. This is only available in Safaricom's official M-PESA app and STK menu.
          </p>
        </div>
      </div>
    </div>
  );
}