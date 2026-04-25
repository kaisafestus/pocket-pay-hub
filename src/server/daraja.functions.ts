import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const env = () => ({
  env: (process.env.MPESA_ENV ?? "sandbox") as "sandbox" | "production",
  ck: process.env.MPESA_CONSUMER_KEY,
  cs: process.env.MPESA_CONSUMER_SECRET,
  shortcode: process.env.MPESA_SHORTCODE ?? "174379",
  passkey: process.env.MPESA_PASSKEY ?? "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
  callbackBase: process.env.MPESA_CALLBACK_BASE ?? "",
});

const baseUrl = (e: "sandbox" | "production") =>
  e === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

async function getToken() {
  const c = env();
  if (!c.ck || !c.cs) throw new Error("MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET are not configured.");
  const auth = Buffer.from(`${c.ck}:${c.cs}`).toString("base64");
  const r = await fetch(`${baseUrl(c.env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Bearer ${auth}`.replace("Bearer ", "Basic ") },
  });
  if (!r.ok) throw new Error(`Daraja auth failed: ${r.status}`);
  const j = (await r.json()) as { access_token: string };
  return j.access_token;
}

function timestamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function normPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.startsWith("254")) return d;
  if (d.startsWith("0")) return "254" + d.slice(1);
  if (d.length === 9) return "254" + d;
  return d;
}

export const stkPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ phone: z.string().min(10).max(15), amount: z.number().int().min(1).max(150000) }).parse)
  .handler(async ({ data, context }) => {
    const c = env();
    const token = await getToken();
    const ts = timestamp();
    const password = Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString("base64");
    const phone = normPhone(data.phone);
    const callbackUrl = c.callbackBase ? `${c.callbackBase}/api/public/mpesa/stk-callback` : "https://example.com/callback";

    const body = {
      BusinessShortCode: c.shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: data.amount,
      PartyA: phone,
      PartyB: c.shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: "MPESA-LITE",
      TransactionDesc: "Wallet Top Up",
    };

    const r = await fetch(`${baseUrl(c.env)}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { CheckoutRequestID?: string; MerchantRequestID?: string; ResponseCode?: string; errorMessage?: string };
    if (!r.ok || j.ResponseCode !== "0") throw new Error(j.errorMessage ?? "STK Push failed");

    const sb = admin();
    const ref = "MP" + Math.random().toString(36).slice(2, 10).toUpperCase();
    await sb.from("transactions").insert({
      ref_code: ref,
      type: "mpesa_topup",
      status: "pending",
      amount: data.amount,
      recipient_id: context.userId,
      recipient_phone: phone,
      description: `M-PESA Top Up`,
      checkout_request_id: j.CheckoutRequestID,
      merchant_request_id: j.MerchantRequestID,
    });

    return { ok: true, checkoutRequestId: j.CheckoutRequestID };
  });

export const checkTopupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ checkoutRequestId: z.string() }).parse)
  .handler(async ({ data, context }) => {
    const sb = admin();
    const { data: t } = await sb.from("transactions").select("status, amount").eq("checkout_request_id", data.checkoutRequestId).eq("recipient_id", context.userId).maybeSingle();
    return { status: t?.status ?? "pending", amount: t?.amount ?? 0 };
  });