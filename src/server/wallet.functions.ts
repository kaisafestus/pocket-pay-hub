import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import bcrypt from "bcryptjs";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing SUPABASE service role config");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const phoneRe = /^254[17]\d{8}$/;
function normPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.startsWith("254")) return d;
  if (d.startsWith("0")) return "254" + d.slice(1);
  if (d.length === 9) return "254" + d;
  return d;
}

/* ================= PHONE LOOKUP (Numverify + local profile) ================= */

export const lookupPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ phone: z.string().min(7).max(20) }).parse)
  .handler(async ({ data, context }) => {
    const phone = normPhone(data.phone);
    if (!phoneRe.test(phone)) throw new Error("Invalid Kenyan phone number");

    // 1) Local registered user takes priority — show their registered name.
    const sb = admin();
    const { data: prof } = await sb
      .from("profiles")
      .select("id, full_name")
      .eq("phone", phone)
      .maybeSingle();
    const isSelf = prof?.id === context.userId;

    // 2) Numverify — validates number + returns carrier/country (no name).
    let carrier: string | null = null;
    let country: string | null = null;
    let international: string | null = null;
    const nvKey = process.env.NUMVERIFY_API_KEY;
    if (nvKey) {
      try {
        const res = await fetch(
          `http://apilayer.net/api/validate?access_key=${encodeURIComponent(nvKey)}&number=${encodeURIComponent(phone)}&country_code=KE&format=1`,
        );
        const nv = (await res.json()) as {
          valid?: boolean;
          international_format?: string;
          country_name?: string;
          carrier?: string;
        };
        if (nv.valid) {
          carrier = nv.carrier || null;
          country = nv.country_name || null;
          international = nv.international_format || null;
        }
      } catch { /* non-fatal */ }
    }
    if (!international) international = "+" + phone;

    // 3) Eyecon caller-ID (RapidAPI) — real name lookup for ANY number.
    let callerName: string | null = null;
    const rapidKey = process.env.RAPIDAPI_KEY;
    if (rapidKey && !prof) {
      try {
        const res = await fetch(
          `https://eyecon.p.rapidapi.com/api/v1/search?code=254&number=${encodeURIComponent(phone.slice(3))}`,
          {
            headers: {
              "x-rapidapi-key": rapidKey,
              "x-rapidapi-host": "eyecon.p.rapidapi.com",
            },
          },
        );
        if (res.ok) {
          const j = (await res.json()) as {
            name?: string;
            fullName?: string;
            data?: { name?: string; fullName?: string } | Array<{ name?: string; fullName?: string }>;
          };
          const first = Array.isArray(j.data) ? j.data[0] : j.data;
          callerName =
            j.name || j.fullName || first?.name || first?.fullName || null;
        }
      } catch { /* non-fatal */ }
    }

    const name = prof?.full_name ?? callerName ?? null;
    const displayName = name ?? "M-PESA User";

    return {
      phone,
      valid: true,
      carrier,
      country,
      lineType: null as string | null,
      international,
      registered: !!prof || !!callerName, // allow sending if we have a name from any source
      name: displayName,
      isSelf,
    };
  });

/* ================= SET / VERIFY PIN ================= */

export const setPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ pin: z.string().regex(/^\d{4}$/), currentPin: z.string().regex(/^\d{4}$/).optional() }).parse)
  .handler(async ({ data, context }) => {
    const sb = admin();
    const { data: w } = await sb.from("wallets").select("pin_hash").eq("user_id", context.userId).single();
    if (w?.pin_hash) {
      if (!data.currentPin) throw new Error("Enter your current PIN");
      if (!bcrypt.compareSync(data.currentPin, w.pin_hash)) throw new Error("Current PIN is incorrect");
    }
    const hash = bcrypt.hashSync(data.pin, 10);
    const { error } = await sb.from("wallets").update({ pin_hash: hash }).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function verifyPin(userId: string, pin: string) {
  const sb = admin();
  const { data } = await sb.from("wallets").select("pin_hash").eq("user_id", userId).single();
  if (!data?.pin_hash) {
    // First transaction — adopt the entered PIN as the canonical M-PESA PIN.
    // (Same PIN they used to register / sign in, so this is seamless.)
    const hash = bcrypt.hashSync(pin, 10);
    await sb.from("wallets").update({ pin_hash: hash }).eq("user_id", userId);
    return;
  }
  if (!bcrypt.compareSync(pin, data.pin_hash)) throw new Error("Incorrect M-PESA PIN");
}

/* ================= SEND MONEY ================= */

export const sendMoney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    phone: z.string().min(10).max(15),
    amount: z.number().positive().max(150000),
    description: z.string().max(120).optional(),
    pin: z.string().regex(/^\d{4}$/),
  }).parse)
  .handler(async ({ data, context }) => {
    await verifyPin(context.userId, data.pin);
    const phone = normPhone(data.phone);
    if (!phoneRe.test(phone)) throw new Error("Invalid Kenyan phone number");
    const sb = admin();
    const { data: prof } = await sb.from("profiles").select("id, full_name").eq("phone", phone).maybeSingle();
    if (prof && prof.id === context.userId) throw new Error("You can't send money to yourself");
    const fee = data.amount > 100 ? Math.min(Math.ceil(data.amount * 0.01), 110) : 0;
    const { data: txnId, error } = await sb.rpc("transfer_funds", {
      _sender: context.userId,
      _recipient: prof?.id ?? undefined,
      _amount: data.amount,
      _type: "send_money",
      _description: data.description ?? `Send to ${prof?.full_name ?? phone}`,
      _recipient_phone: phone,
      _shortcode: undefined,
      _account_ref: undefined,
      _fee: fee,
    });
    if (error) throw new Error(error.message);
    return { ok: true, txnId };
  });

/* ================= PAY TILL ================= */

export const payTill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    till: z.string().min(4).max(10).regex(/^\d+$/),
    amount: z.number().positive().max(300000),
    pin: z.string().regex(/^\d{4}$/),
  }).parse)
  .handler(async ({ data, context }) => {
    await verifyPin(context.userId, data.pin);
    const sb = admin();
    const { data: m } = await sb.from("merchants").select("user_id, business_name, type").eq("shortcode", data.till).maybeSingle();
    if (!m || m.type !== "till") throw new Error("Till number not found");
    const { data: txnId, error } = await sb.rpc("transfer_funds", {
      _sender: context.userId,
      _recipient: m.user_id,
      _amount: data.amount,
      _type: "pay_till",
      _description: `Pay ${m.business_name}`,
      _shortcode: data.till,
      _recipient_phone: undefined,
      _account_ref: undefined,
      _fee: 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true, txnId, business: m.business_name };
  });

/* ================= PAY BILL ================= */

export const payBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    paybill: z.string().min(4).max(10).regex(/^\d+$/),
    account: z.string().min(1).max(60),
    amount: z.number().positive().max(500000),
    pin: z.string().regex(/^\d{4}$/),
  }).parse)
  .handler(async ({ data, context }) => {
    await verifyPin(context.userId, data.pin);
    const sb = admin();
    const { data: m } = await sb.from("merchants").select("user_id, business_name, type").eq("shortcode", data.paybill).maybeSingle();
    if (!m || m.type !== "paybill") throw new Error("Paybill number not found");
    const { data: txnId, error } = await sb.rpc("transfer_funds", {
      _sender: context.userId,
      _recipient: m.user_id,
      _amount: data.amount,
      _type: "pay_bill",
      _description: `Pay ${m.business_name} • ${data.account}`,
      _shortcode: data.paybill,
      _account_ref: data.account,
      _recipient_phone: undefined,
      _fee: 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true, txnId, business: m.business_name };
  });

/* ================= WITHDRAW AT AGENT ================= */

export const withdrawAtAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    agentNumber: z.string().min(3).max(10).regex(/^\d+$/),
    amount: z.number().positive().max(150000),
    pin: z.string().regex(/^\d{4}$/),
  }).parse)
  .handler(async ({ data, context }) => {
    await verifyPin(context.userId, data.pin);
    const sb = admin();
    const { data: agent } = await sb.from("agents").select("user_id, store_name, float_balance").eq("agent_number", data.agentNumber).maybeSingle();
    if (!agent) throw new Error("Agent not found");
    if (Number(agent.float_balance) < data.amount) throw new Error("Agent has insufficient float");
    const fee = Math.max(28, Math.ceil(data.amount * 0.01));
    // Move money from customer wallet -> agent's float (agent gives cash physically)
    const { data: txnId, error } = await sb.rpc("transfer_funds", {
      _sender: context.userId,
      _recipient: agent.user_id,
      _amount: data.amount,
      _type: "withdraw_agent",
      _description: `Withdraw at ${agent.store_name}`,
      _shortcode: data.agentNumber,
      _recipient_phone: undefined,
      _account_ref: undefined,
      _fee: fee,
    });
    if (error) throw new Error(error.message);
    // Update agent float (cash leaves their till — but in our ledger they receive into wallet AND lose float)
    await sb.from("agents").update({ float_balance: Number(agent.float_balance) - data.amount }).eq("user_id", agent.user_id);
    return { ok: true, txnId, agent: agent.store_name };
  });

/* ================= AGENT: DEPOSIT FOR CUSTOMER ================= */

export const agentDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    customerPhone: z.string().min(10).max(15),
    amount: z.number().positive().max(150000),
  }).parse)
  .handler(async ({ data, context }) => {
    const sb = admin();
    const { data: agent } = await sb.from("agents").select("agent_number, store_name, float_balance").eq("user_id", context.userId).maybeSingle();
    if (!agent) throw new Error("You are not registered as an agent");
    const phone = normPhone(data.customerPhone);
    const { data: cust } = await sb.from("profiles").select("id, full_name").eq("phone", phone).maybeSingle();
    if (!cust) throw new Error("Customer phone not found on M-PESA Lite");

    // Agent receives cash physically (float increases), customer wallet credited
    const { data: txnId, error } = await sb.rpc("transfer_funds", {
      _sender: context.userId,   // From agent's "wallet" (they collect cash; we mirror in ledger)
      _recipient: cust.id,
      _amount: data.amount,
      _type: "deposit_agent",
      _description: `Deposit by agent ${agent.store_name}`,
      _shortcode: agent.agent_number,
      _recipient_phone: phone,
      _account_ref: undefined,
      _fee: 0,
    });
    if (error) throw new Error(error.message);
    await sb.from("agents").update({ float_balance: Number(agent.float_balance) + data.amount }).eq("user_id", context.userId);
    return { ok: true, txnId, customer: cust.full_name };
  });

/* ================= ROLE ENROLLMENT ================= */

export const becomeAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    storeName: z.string().min(2).max(80),
    location: z.string().max(120).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const sb = admin();
    const agentNumber = String(100000 + Math.floor(Math.random() * 899999));
    const { error } = await sb.from("agents").insert({
      user_id: context.userId,
      agent_number: agentNumber,
      store_name: data.storeName,
      location: data.location,
      float_balance: 0,
    });
    if (error) throw new Error(error.message);
    await sb.from("user_roles").insert({ user_id: context.userId, role: "agent" }).then(() => {});
    return { ok: true, agentNumber };
  });

export const becomeMerchant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    businessName: z.string().min(2).max(80),
    type: z.enum(["till", "paybill"]),
    category: z.string().max(60).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    const sb = admin();
    const shortcode = String(400000 + Math.floor(Math.random() * 599999));
    const { error } = await sb.from("merchants").insert({
      user_id: context.userId,
      type: data.type,
      shortcode,
      business_name: data.businessName,
      category: data.category,
    });
    if (error) throw new Error(error.message);
    await sb.from("user_roles").insert({ user_id: context.userId, role: "merchant" }).then(() => {});
    return { ok: true, shortcode };
  });

/* ================= REVERSAL (only sender can request, only if recipient hasn't moved it) ================= */

export const requestReversal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ txnId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const sb = admin();
    const { data: txn } = await sb.from("transactions").select("*").eq("id", data.txnId).single();
    if (!txn || txn.sender_id !== context.userId) throw new Error("Transaction not found");
    if (txn.status !== "completed") throw new Error("Only completed transactions can be reversed");
    if (!["send_money", "pay_till", "pay_bill"].includes(txn.type)) throw new Error("This transaction type cannot be reversed");
    if (!txn.recipient_id) throw new Error("Cannot reverse this transaction");
    const ageMin = (Date.now() - new Date(txn.completed_at ?? txn.created_at).getTime()) / 60000;
    if (ageMin > 30) throw new Error("Reversal window (30 min) has passed. Contact support.");

    // Reverse: move money back
    const { error } = await sb.rpc("transfer_funds", {
      _sender: txn.recipient_id,
      _recipient: txn.sender_id,
      _amount: Number(txn.amount),
      _type: "reversal",
      _description: `Reversal of ${txn.ref_code}`,
      _shortcode: undefined,
      _recipient_phone: undefined,
      _account_ref: txn.ref_code,
      _fee: 0,
    });
    if (error) throw new Error(error.message);
    await sb.from("transactions").update({ status: "reversed" }).eq("id", data.txnId);
    return { ok: true };
  });