import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTransaction, requestReversal } from "@/server/wallet.functions";
import { Loader2, X, Star, RotateCcw, FileText, Share2, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatKES, errMsg } from "@/lib/format";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app/success/$txnId")({ component: SuccessScreen });

function initials(name: string | null | undefined) {
  if (!name) return "MP";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "MP";
}

/** Mask middle of a phone keeping a small prefix and last 2 visible. e.g. +254712***45 */
function maskPhone(p: string | null | undefined): string {
  if (!p) return "";
  const s = String(p).trim();
  if (s.length <= 5) return s;
  const prefix = s.slice(0, Math.max(4, s.length - 5));
  const last2 = s.slice(-2);
  return `${prefix}***${last2}`;
}

function SuccessScreen() {
  const { txnId } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const get = useServerFn(getTransaction);
  const reverse = useServerFn(requestReversal);
  const [copied, setCopied] = useState(false);
  const [reversing, setReversing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["txn", txnId],
    queryFn: () => get({ data: { id: txnId } }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6 text-center">
        <div>
          <p className="text-sm text-destructive mb-3">{errMsg(error)}</p>
          <Link to="/app" className="text-primary underline">Back to home</Link>
        </div>
      </div>
    );
  }

  const t = data.txn;
  const recipientName = data.recipientName ?? "Recipient";
  const phone = t.recipient_phone ?? t.recipient_shortcode ?? "";
  const dt = new Date(t.completed_at ?? t.created_at);
  const dateStr = dt.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.ref_code);
      setCopied(true);
      toast.success("Reference copied");
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const onReverse = async () => {
    if (t.sender_id !== user?.id) { toast.error("Only the sender can reverse"); return; }
    setReversing(true);
    try {
      await reverse({ data: { txnId: t.id } });
      toast.success("Reversal completed");
      nav({ to: "/app" });
    } catch (e) { toast.error(errMsg(e)); }
    finally { setReversing(false); }
  };

  const onShare = async () => {
    const text = `M-PESA: ${formatKES(Number(t.amount))} sent to ${recipientName} ${phone}. Ref: ${t.ref_code}`;
    try {
      if (navigator.share) await navigator.share({ title: "M-PESA receipt", text });
      else { await navigator.clipboard.writeText(text); toast.success("Receipt copied"); }
    } catch { /* user cancelled */ }
  };

  const onDownload = () => {
    const text = `M-PESA RECEIPT
================
Reference: ${t.ref_code}
Date: ${dateStr} ${timeStr}
Amount: ${formatKES(Number(t.amount))}
Transaction cost: ${formatKES(Number(t.fee))}
Sent to: ${recipientName}
Phone: ${phone}
Status: Successful
`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mpesa-${t.ref_code}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0d0d0d] text-zinc-100">
      <div className="px-5 pt-5">
        <Link to="/app" className="h-10 w-10 grid place-items-center rounded-full bg-zinc-800/80 hover:bg-zinc-700 transition" aria-label="Close">
          <X className="h-5 w-5 text-rose-500" />
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center px-5 mt-4">
        {/* Card with rainbow top border */}
        <div className="relative w-full max-w-sm">
          {/* Confetti circle */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-10 h-20 w-20 rounded-full bg-zinc-900 border border-zinc-700 grid place-items-center text-3xl shadow-lg z-10">
            🎉
          </div>
          <div className="rounded-3xl bg-zinc-900 pt-14 pb-6 px-6 border border-zinc-800 relative overflow-hidden">
            {/* Rainbow top border */}
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "linear-gradient(90deg, #3b82f6, #06b6d4, #22c55e)" }} />

            <h1 className="text-center text-2xl font-semibold leading-tight">Your transaction was<br />successful</h1>
            <p className="text-center text-sm text-zinc-400 mt-3">{dateStr} | {timeStr}</p>
            <p className="text-center text-3xl font-bold mt-4 tabular-nums">{formatKES(Number(t.amount))}</p>
            <p className="text-center text-sm text-zinc-400 mt-2">
              Transaction cost:<span className="text-zinc-200 font-medium">{formatKES(Number(t.fee))}</span>
            </p>

            <button onClick={copy} className="mx-auto mt-3 flex items-center gap-2 text-emerald-400 font-semibold tracking-wider text-sm">
              <span>ID: {t.ref_code}</span>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="text-emerald-400">Copy</span>
            </button>

            <div className="mt-5 rounded-2xl bg-zinc-800/70 px-4 py-4 border border-zinc-700/60">
              <p className="text-sm text-zinc-400">Send to:</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-orange-700 grid place-items-center font-semibold text-white text-sm">
                  {initials(recipientName)}
                </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{recipientName}</p>
                <p className="text-sm text-zinc-300 truncate">Phone number: {maskPhone(phone)}</p>
              </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-4 gap-3 w-full max-w-sm mt-6">
          <ActionBtn icon={Star} label="Add to favourites" onClick={() => toast("Added to favourites")} />
          <ActionBtn icon={RotateCcw} label="Reverse transaction" onClick={onReverse} disabled={reversing || t.sender_id !== user?.id} />
          <ActionBtn icon={FileText} label="Download receipt" onClick={onDownload} />
          <ActionBtn icon={Share2} label="Share details" onClick={onShare} />
        </div>

        <div className="flex-1" />

        <button
          onClick={() => nav({ to: "/app" })}
          className="w-full max-w-sm mb-8 mt-6 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-base transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, disabled }: { icon: typeof Star; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex flex-col items-center gap-2 disabled:opacity-40">
      <span className="h-12 w-12 rounded-full bg-zinc-800 border border-zinc-700 grid place-items-center text-emerald-400">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] text-zinc-300 text-center leading-tight">{label}</span>
    </button>
  );
}