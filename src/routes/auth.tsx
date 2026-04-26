import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Smartphone, User } from "lucide-react";
import { normalizePhone254, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useInstall } from "@/lib/pwa";

export const Route = createFileRoute("/auth")({ component: AuthScreen });

type Stage = "welcome" | "phone" | "pin" | "register";

type SavedProfile = { phone: string; name: string };
const PROFILE_KEY = "mpesa.profile";
const loadProfile = (): SavedProfile | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as SavedProfile) : null;
  } catch { return null; }
};
const saveProfile = (p: SavedProfile) => {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
};
const clearProfile = () => {
  try { localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
};

const phoneToEmail = (p: string) => `${normalizePhone254(p)}@mpesa.local`;
// Supabase requires min 6 chars for passwords; we expand the 4-digit PIN deterministically.
// This is an internal-only transform — the user only ever types 4 digits.
const pinToPassword = (pin: string, phone: string) => {
  const p = normalizePhone254(phone);
  return `mpesa-pin:${p}:${pin}`;
};

function AuthScreen() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(null);
  const [stage, setStage] = useState<Stage>("phone");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  // Initialise from localStorage on mount.
  useEffect(() => {
    const p = loadProfile();
    if (p) {
      setSavedProfile(p);
      setPhone(p.phone);
      setStage("welcome");
    }
  }, []);

  useEffect(() => { if (!loading && user) nav({ to: "/app" }); }, [loading, user, nav]);

  const checkPhone = async () => {
    const p = normalizePhone254(phone);
    if (!/^254[17]\d{8}$/.test(p)) return setError("Enter a valid Safaricom number");
    setBusy(true);
    // Try sign-in stub: signInWithOtp would require email; instead we call an RPC-free check via signIn with a fake password attempt.
    // We just check profile existence via a public RPC-less query: phone is unique on profiles but RLS blocks anonymous reads.
    // Workaround: try sign-in with bogus pin — error message tells us if user exists.
    const { error: err } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(p),
      password: pinToPassword("0000", p), // probe — won't match any real PIN
    });
    setBusy(false);
    if (err && err.message.toLowerCase().includes("invalid")) {
      // could mean wrong creds (user exists) or user not found — Supabase returns "Invalid login credentials" for both.
      // We'll proceed to PIN screen optimistically; if it fails 3 times, allow Register.
      setStage("pin");
    } else if (err) {
      setError(err.message);
    } else {
      // somehow signed in — go to app
      nav({ to: "/app" });
    }
  };
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-hero)" }}>
      <div className="flex-1 flex flex-col">
        <Header onBack={
          stage === "welcome" || stage === "phone"
            ? undefined
            : () => { setStage(savedProfile ? "welcome" : "phone"); setError(null); }
        } />

        {stage === "welcome" && savedProfile && (
          <WelcomeBackStage
            profile={savedProfile}
            onSwitchAccount={() => {
              clearProfile();
              setSavedProfile(null);
              setPhone("");
              setStage("phone");
            }}
            onSuccess={() => nav({ to: "/app" })}
            onSwitchToRegister={() => setStage("register")}
          />
        )}

        {stage === "phone" && (
          <PhoneStage
            phone={phone}
            setPhone={setPhone}
            error={error}
            busy={busy}
            onContinue={checkPhone}
            onRegister={() => { setError(null); setStage("register"); }}
          />
        )}

        {stage === "pin" && (
          <PinStage
            phone={phone}
            onSwitchToRegister={() => setStage("register")}
            onSuccess={(name) => {
              saveProfile({ phone: normalizePhone254(phone), name: name ?? "" });
              nav({ to: "/app" });
            }}
          />
        )}

        {stage === "register" && (
          <RegisterStage
            initialPhone={phone}
            onBack={() => setStage("phone")}
            onDone={(reg) => {
              saveProfile({ phone: normalizePhone254(reg.phone), name: reg.name });
              nav({ to: "/app" });
            }}
          />
        )}
      </div>
      <InstallFooter />
    </div>
  );
}

function Header({ onBack }: { onBack?: () => void }) {
  return (
    <div className="flex items-center px-4 pt-4 text-primary-foreground">
      {onBack ? (
        <button onClick={onBack} className="h-10 w-10 rounded-full grid place-items-center bg-primary-foreground/15 hover:bg-primary-foreground/25">
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : <div className="h-10 w-10" />}
      <div className="flex-1 text-center font-bold tracking-wide">M-PESA</div>
      <div className="h-10 w-10" />
    </div>
  );
}

function PhoneStage({
  phone, setPhone, error, busy, onContinue, onRegister,
}: {
  phone: string; setPhone: (s: string) => void;
  error: string | null; busy: boolean;
  onContinue: () => void; onRegister: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col px-6 pt-12">
      <div className="text-primary-foreground text-center">
        <div className="h-20 w-20 mx-auto rounded-3xl bg-primary-foreground/15 backdrop-blur grid place-items-center mb-5">
          <Smartphone className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-bold">Karibu M-PESA</h1>
        <p className="text-sm opacity-80 mt-1">Enter your phone number to continue</p>
      </div>

      <div className="bg-card text-card-foreground rounded-3xl p-6 mt-10 shadow-2xl">
        <Label htmlFor="phone" className="text-xs text-muted-foreground">M-PESA phone number</Label>
        <Input
          id="phone" type="tel" inputMode="tel" placeholder="0712 345 678" autoFocus
          value={phone} onChange={(e) => setPhone(e.target.value)}
          className="mt-1 h-12 text-lg"
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <Button className="w-full mt-5 h-12 text-base font-semibold" disabled={busy || phone.length < 9} onClick={onContinue}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Continue
        </Button>
        <button onClick={onRegister} className="mt-4 w-full text-center text-sm text-primary font-medium">
          New to M-PESA? Create account →
        </button>
      </div>
    </div>
  );
}

function PinStage({ phone, onSwitchToRegister, onSuccess }: { phone: string; onSwitchToRegister: () => void; onSuccess: () => void }) {
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [state, setState] = useState<"idle" | "checking" | "success" | "error">("idle");
  const [attempts, setAttempts] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const setDigit = (i: number, v: string) => {
    const c = v.replace(/\D/g, "").slice(-1);
    setPin((prev) => {
      const next = [...prev];
      next[i] = c;
      return next;
    });
    if (c && i < 3) inputs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pin[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  useEffect(() => {
    const code = pin.join("");
    if (code.length !== 4 || state === "checking") return;
    setState("checking");
    void (async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email: `${normalizePhone254(phone)}@mpesa.local`,
        password: pinToPassword(code, phone),
      });
      if (error) {
        setState("error");
        setAttempts((n) => n + 1);
        setTimeout(() => {
          setPin(["", "", "", ""]);
          setState("idle");
          inputs.current[0]?.focus();
        }, 700);
      } else {
        setState("success");
        setTimeout(onSuccess, 400);
      }
    })();
  }, [pin, state, phone, onSuccess]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  return (
    <div className="flex-1 flex flex-col px-6 pt-12">
      <div className="text-primary-foreground text-center">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-primary-foreground/15 backdrop-blur grid place-items-center font-bold text-xl">
          {(/^254/.test(normalizePhone254(phone)) ? formatPhone(phone)[5] : "·").toString()}
        </div>
        <h1 className="text-xl font-bold mt-4">Enter your M-PESA PIN</h1>
        <p className="text-sm opacity-80 mt-1">{formatPhone(phone)}</p>
      </div>

      <div className="mt-12 flex justify-center gap-3">
        {pin.map((d, i) => {
          const filled = !!d;
          const color =
            state === "success" ? "border-success bg-success text-success-foreground" :
            state === "error" ? "border-destructive bg-destructive text-destructive-foreground animate-[shake_0.4s]" :
            filled ? "border-primary-foreground bg-primary-foreground text-primary" :
            "border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground";
          return (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              type="password" inputMode="numeric" maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              disabled={state === "checking" || state === "success"}
              className={cn(
                "h-16 w-14 text-center text-2xl font-bold rounded-2xl border-2 transition-all outline-none caret-transparent",
                color,
              )}
            />
          );
        })}
      </div>

      <p className={cn("text-center text-sm mt-6 transition-colors",
        state === "error" ? "text-destructive-foreground bg-destructive/40 mx-auto px-3 py-1 rounded-full" :
        "text-primary-foreground/80")}>
        {state === "checking" && "Verifying…"}
        {state === "success" && "✓ Welcome back"}
        {state === "error" && "Wrong PIN. Try again."}
        {state === "idle" && "Enter your 4-digit M-PESA PIN"}
      </p>

      {attempts >= 2 && state !== "success" && (
        <button onClick={onSwitchToRegister} className="mt-8 text-sm text-primary-foreground/90 underline self-center">
          Forgot? I want to register a new account
        </button>
      )}
    </div>
  );
}

function RegisterStage({ initialPhone, onBack, onDone }: { initialPhone: string; onBack: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(initialPhone);
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [confirm, setConfirm] = useState<string[]>(["", "", "", ""]);
  const [step, setStep] = useState<"info" | "pin" | "confirm">("info");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (finalPin: string) => {
    setBusy(true); setError(null);
    const p = normalizePhone254(phone);
    const { error: err } = await supabase.auth.signUp({
      email: `${p}@mpesa.local`,
      password: pinToPassword(finalPin, p),
      options: { data: { full_name: name, phone: p } },
    });
    setBusy(false);
    if (err) {
      setError(err.message.includes("registered") ? "This number is already registered. Go back and sign in." : err.message);
      setStep("info");
      return;
    }
    onDone();
  };

  return (
    <div className="flex-1 flex flex-col px-6 pt-8">
      <div className="text-primary-foreground text-center">
        <h1 className="text-2xl font-bold">Create M-PESA account</h1>
        <p className="text-sm opacity-80 mt-1">
          {step === "info" ? "Tell us about you" : step === "pin" ? "Choose a 4-digit PIN" : "Confirm your PIN"}
        </p>
      </div>

      <div className="bg-card text-card-foreground rounded-3xl p-6 mt-8 shadow-2xl">
        {step === "info" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Wanjiku" maxLength={80} className="h-12" />
            </div>
            <div className="space-y-1.5">
              <Label>M-PESA phone</Label>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className="h-12" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button className="w-full h-12 text-base" disabled={name.trim().length < 2 || normalizePhone254(phone).length < 12}
              onClick={() => { setError(null); setStep("pin"); }}>
              Continue
            </Button>
            <button onClick={onBack} className="w-full text-center text-sm text-muted-foreground">← Back to sign in</button>
          </div>
        )}

        {step === "pin" && (
          <PinEntry pin={pin} setPin={setPin} onComplete={() => setStep("confirm")} />
        )}

        {step === "confirm" && (
          <PinEntry pin={confirm} setPin={setConfirm}
            error={error}
            busy={busy}
            onComplete={(typed) => {
              const a = pin.join("");
              const b = typed ?? confirm.join("");
              if (a !== b) { setError("PINs don't match. Try again."); setConfirm(["", "", "", ""]); return; }
              void submit(a);
            }}
          />
        )}
      </div>
    </div>
  );
}

function PinEntry({
  pin, setPin, onComplete, error, busy,
}: {
  pin: string[]; setPin: (p: string[]) => void;
  onComplete: (code: string) => void; error?: string | null; busy?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);

  const setDigit = (i: number, v: string) => {
    const c = v.replace(/\D/g, "").slice(-1);
    const next = [...pin]; next[i] = c; setPin(next);
    if (c && i < 3) refs.current[i + 1]?.focus();
    const code = next.join("");
    if (code.length === 4 && next.every((d) => d)) {
      setTimeout(() => onComplete(code), 100);
    }
  };

  return (
    <div>
      <div className="flex justify-center gap-3">
        {pin.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="password" inputMode="numeric" maxLength={1}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Backspace" && !pin[i] && i > 0) refs.current[i - 1]?.focus(); }}
            disabled={busy}
            className={cn(
              "h-16 w-14 text-center text-2xl font-bold rounded-2xl border-2 transition-all outline-none caret-transparent",
              d ? "border-primary bg-primary text-primary-foreground" : "border-input bg-muted text-foreground"
            )}
          />
        ))}
      </div>
      {busy && <p className="mt-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating your account…</p>}
      {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
    </div>
  );
}

function InstallFooter() {
  const { canInstall, isInstalled, promptInstall } = useInstall();
  if (isInstalled || !canInstall) return null;
  return (
    <div className="px-6 pb-6">
      <button
        onClick={() => void promptInstall()}
        className="w-full bg-primary-foreground/15 backdrop-blur text-primary-foreground rounded-2xl py-3 text-sm font-medium hover:bg-primary-foreground/25 transition"
      >
        ⬇ Install M-PESA on your phone
      </button>
    </div>
  );
}