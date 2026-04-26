import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/mpesa/AppHeader";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { setPin, becomeAgent, becomeMerchant } from "@/server/wallet.functions";
import { toast } from "sonner";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, Store, Wallet, LogOut, KeyRound } from "lucide-react";
import { formatPhone , errMsg} from "@/lib/format";

export const Route = createFileRoute("/app/account")({ component: AccountPage });

function AccountPage() {
  const { user, roles, signOut, refreshRoles } = useAuth();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });
  const { data: hasPin } = useQuery({
    queryKey: ["has-pin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("pin_hash").eq("user_id", user!.id).maybeSingle();
      return Boolean(data?.pin_hash);
    },
  });

  return (
    <div className="min-h-screen">
      <AppHeader title="My Account" subtitle={formatPhone(profile?.phone ?? "")} />
      <div className="mx-auto max-w-md px-5 -mt-6 space-y-4">
        <div className="rounded-2xl bg-card border p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="font-semibold">{profile?.full_name}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <p className="text-xs mt-2">Roles: {roles.join(", ") || "customer"}</p>
        </div>

        <PinManager hasPin={Boolean(hasPin)} onDone={() => qc.invalidateQueries({ queryKey: ["has-pin"] })} />

        {!roles.includes("agent") && (
          <BecomeAgent onDone={refreshRoles} />
        )}
        {!roles.includes("merchant") && (
          <BecomeMerchant onDone={refreshRoles} />
        )}

        {roles.includes("agent") && (
          <Link to="/app/agent" className="block rounded-2xl bg-card border p-5 flex items-center gap-3 hover:shadow-md" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
              <Wallet className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Agent Dashboard</p>
              <p className="text-xs text-muted-foreground">Manage float, deposits & withdrawals</p>
            </div>
          </Link>
        )}
        {roles.includes("merchant") && (
          <Link to="/app/merchant" className="block rounded-2xl bg-card border p-5 flex items-center gap-3 hover:shadow-md" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
              <Store className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Merchant Dashboard</p>
              <p className="text-xs text-muted-foreground">View your Till/Paybill payments</p>
            </div>
          </Link>
        )}

        <Button variant="outline" className="w-full" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" />Sign out
        </Button>
      </div>
    </div>
  );
}

function PinManager({ hasPin, onDone }: { hasPin: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [pin1, setPin1] = useState(""); const [pin2, setPin2] = useState("");
  const fn = useServerFn(setPin);

  const submit = async () => {
    if (pin1.length !== 4 || pin1 !== pin2) return toast.error("PIN must be 4 digits and match");
    if (hasPin && current.length !== 4) return toast.error("Enter your current PIN");
    try {
      await fn({ data: { pin: pin1, currentPin: hasPin ? current : undefined } });
      toast.success(hasPin ? "PIN changed" : "PIN set");
      setOpen(false); setPin1(""); setPin2(""); setCurrent("");
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full rounded-2xl bg-card border p-5 flex items-center gap-3 hover:shadow-md text-left" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            {hasPin ? <KeyRound className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <p className="font-semibold">{hasPin ? "Change M-PESA PIN" : "Set M-PESA PIN"}</p>
            <p className="text-xs text-muted-foreground">Required for every transaction</p>
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{hasPin ? "Change" : "Set"} M-PESA PIN</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {hasPin && <div className="space-y-1.5"><Label>Current PIN</Label><Input type="password" inputMode="numeric" maxLength={4} value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))} /></div>}
          <div className="space-y-1.5"><Label>New 4-digit PIN</Label><Input type="password" inputMode="numeric" maxLength={4} value={pin1} onChange={(e) => setPin1(e.target.value.replace(/\D/g, ""))} /></div>
          <div className="space-y-1.5"><Label>Confirm new PIN</Label><Input type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} /></div>
        </div>
        <DialogFooter><Button onClick={submit} className="w-full">Save PIN</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BecomeAgent({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [loc, setLoc] = useState("");
  const fn = useServerFn(becomeAgent);
  const submit = async () => {
    try {
      const r = await fn({ data: { storeName: name, location: loc } });
      toast.success(`You are now an agent. Number: ${r.agentNumber}`);
      setOpen(false); onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full rounded-2xl bg-card border p-5 flex items-center gap-3 hover:shadow-md text-left" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-muted text-muted-foreground"><Wallet className="h-5 w-5" /></div>
          <div className="flex-1"><p className="font-semibold">Become an Agent</p><p className="text-xs text-muted-foreground">Earn from deposits & withdrawals</p></div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Register as M-PESA Agent</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Store name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Location</Label><Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. CBD, Nairobi" /></div>
        </div>
        <DialogFooter><Button onClick={submit} className="w-full" disabled={name.length < 2}>Register</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BecomeMerchant({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [type, setType] = useState<"till" | "paybill">("till"); const [cat, setCat] = useState("");
  const fn = useServerFn(becomeMerchant);
  const submit = async () => {
    try {
      const r = await fn({ data: { businessName: name, type, category: cat } });
      toast.success(`Merchant registered. Shortcode: ${r.shortcode}`);
      setOpen(false); onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full rounded-2xl bg-card border p-5 flex items-center gap-3 hover:shadow-md text-left" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-muted text-muted-foreground"><Store className="h-5 w-5" /></div>
          <div className="flex-1"><p className="font-semibold">Become a Merchant</p><p className="text-xs text-muted-foreground">Get a Till or Paybill number</p></div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Register Business</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Business name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={type === "till" ? "default" : "outline"} onClick={() => setType("till")}>Till</Button>
              <Button type="button" variant={type === "paybill" ? "default" : "outline"} onClick={() => setType("paybill")}>Paybill</Button>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Category</Label><Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="e.g. Restaurant, Utility" /></div>
        </div>
        <DialogFooter><Button onClick={submit} className="w-full" disabled={name.length < 2}>Register</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}