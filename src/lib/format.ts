export function formatKES(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n as number) ? (n as number) : 0);
}

export function formatPhone(p: string | null | undefined): string {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("254")) return "+" + digits;
  if (digits.startsWith("0")) return "+254" + digits.slice(1);
  return p;
}

export function normalizePhone254(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.startsWith("254")) return d;
  if (d.startsWith("0")) return "254" + d.slice(1);
  if (d.length === 9) return "254" + d;
  return d;
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}