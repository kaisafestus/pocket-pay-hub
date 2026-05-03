import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/lib/server-fn-auth";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import bcrypt from "bcryptjs";
import { sendSms } from "./sms.server";

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

/**
 * After a txn is created, fetch the messages the DB trigger generated for this
 * ref_code and SMS each one to its owner's phone via Infobip. Best-effort —
 * never throws (so a failed SMS doesn't roll back a successful transaction).
 * Also sends to `_extraPhone` (e.g. an unregistered recipient_phone).
 */
async function smsForTxn(txnId: string, _extraPhone?: string | null) {
  try {
    const sb = admin();
    const { data: txn } = await sb
      .from("transactions")
      .select("ref_code, amount, type")
      .eq("id", txnId)
      .maybeSingle();
    if (!txn?.ref_code) return;

    const { data: msgs } = await sb
      .from("messages")
      .select("user_id, body")
      .eq("ref_code", txn.ref_code);

    const sent = new Set<string>();
    for (const m of msgs ?? []) {
      const { data: prof } = await sb
        .from("profiles")
        .select("phone")
        .eq("id", m.user_id)
        .maybeSingle();
      const phone = prof?.phone;
      if (!phone || sent.has(phone)) continue;
      sent.add(phone);
      await sendSms(phone, m.body);
    }

    // Notify unregistered recipient (no profile) — synthesize a short SMS.
    if (_extraPhone) {
      const norm = normPhone(_extraPhone);
      if (norm && !sent.has(norm)) {
        const text =
          `${txn.ref_code} Confirmed. You have received Ksh${Number(txn.amount).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on M-PESA. Dial *334# to register and access your funds.`;
        await sendSms(norm, text);
        sent.add(norm);
      }
    }
  } catch (e) {
    console.error("[smsForTxn] failed", e);
  }
}

/* ================= PHONE LOOKUP (Numverify + local profile) ================= */

export const lookupPhone = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
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
      registered: !!prof, // only registered users can actually receive funds
      name: displayName,
      isSelf,
    };
  });

/* ================= SET / VERIFY PIN ================= */

export const setPin = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
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
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
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

    // Resolve a display name for the recipient (for the confirmation message).
    // Priority: registered profile name -> Eyecon caller-ID -> phone number.
    let recipientName: string | null = prof?.full_name ?? null;
    if (!recipientName) {
      const rapidKey = process.env.RAPIDAPI_KEY;
      if (rapidKey) {
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
            recipientName = j.name || j.fullName || first?.name || first?.fullName || null;
          }
        } catch { /* non-fatal */ }
      }
    }
    if (!recipientName) recipientName = "+" + phone;

    const fee = data.amount > 100 ? Math.min(Math.ceil(data.amount * 0.01), 110) : 0;
    const rpcArgs: {
      _sender: string;
      _amount: number;
      _type: "send_money";
      _recipient?: string;
      _description?: string;
      _recipient_phone?: string;
      _fee?: number;
    } = {
      _sender: context.userId,
      _amount: data.amount,
      _type: "send_money",
      _description: data.description ?? `Send to ${recipientName}`,
      _recipient_phone: phone,
      _fee: fee,
    };
    if (prof?.id) rpcArgs._recipient = prof.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: txnId, error } = await sb.rpc("transfer_funds", rpcArgs as any);
    if (error) throw new Error(error.message);
    await smsForTxn(txnId as string, prof?.id ? null : phone);
    return { ok: true, txnId };
  });

/* ================= PAY TILL ================= */

export const payTill = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(z.object({
    till: z.string().min(4).max(10).regex(/^\d+$/),
    amount: z.number().positive().max(300000),
    pin: z.string().regex(/^\d{4}$/),
    description: z.string().trim().min(1).max(60).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await verifyPin(context.userId, data.pin);
    const sb = admin();
    const { data: m } = await sb.from("merchants").select("user_id, business_name, type").eq("shortcode", data.till).maybeSingle();
    if (!m || m.type !== "till") throw new Error("Till number not found");
    const displayName = data.description?.trim() || m.business_name;
    const { data: txnId, error } = await sb.rpc("transfer_funds", {
      _sender: context.userId,
      _recipient: m.user_id,
      _amount: data.amount,
      _type: "pay_till",
      _description: displayName,
      _shortcode: data.till,
      _recipient_phone: undefined,
      _account_ref: undefined,
      _fee: 0,
    });
    if (error) throw new Error(error.message);
    await smsForTxn(txnId as string);
    return { ok: true, txnId, business: displayName };
  });

/* ================= PAY BILL ================= */

export const payBill = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(z.object({
    paybill: z.string().min(4).max(10).regex(/^\d+$/),
    account: z.string().min(1).max(60),
    amount: z.number().positive().max(500000),
    pin: z.string().regex(/^\d{4}$/),
    description: z.string().trim().min(1).max(60).optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await verifyPin(context.userId, data.pin);
    const sb = admin();
    const { data: m } = await sb.from("merchants").select("user_id, business_name, type").eq("shortcode", data.paybill).maybeSingle();
    if (!m || m.type !== "paybill") throw new Error("Paybill number not found");
    const displayName = data.description?.trim() || m.business_name;
    const { data: txnId, error } = await sb.rpc("transfer_funds", {
      _sender: context.userId,
      _recipient: m.user_id,
      _amount: data.amount,
      _type: "pay_bill",
      _description: `${displayName} • ${data.account}`,
      _shortcode: data.paybill,
      _account_ref: data.account,
      _recipient_phone: undefined,
      _fee: 0,
    });
    if (error) throw new Error(error.message);
    await smsForTxn(txnId as string);
    return { ok: true, txnId, business: displayName };
  });

/* ================= WITHDRAW AT AGENT ================= */

export const withdrawAtAgent = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
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
    await smsForTxn(txnId as string);
    return { ok: true, txnId, agent: agent.store_name };
  });

/* ================= AGENT: DEPOSIT FOR CUSTOMER ================= */

export const agentDeposit = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
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
    await smsForTxn(txnId as string);
    return { ok: true, txnId, customer: cust.full_name };
  });

/* ================= ROLE ENROLLMENT ================= */

export const becomeAgent = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
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
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
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
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
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
    // Note: reversal RPC returns void in our code path; messages keyed off the new ref are still SMS-sent via the recipient/sender profiles when their messages row was inserted. We re-fetch the latest reversal txn for this pair:
    const { data: revTxn } = await sb
      .from("transactions")
      .select("id")
      .eq("type", "reversal")
      .eq("account_ref", txn.ref_code)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (revTxn?.id) await smsForTxn(revTxn.id);
    return { ok: true };
  });

/* ================= TOP UP (test/demo) ================= */

export const topupWallet = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(z.object({ amount: z.number().positive().max(300000) }).parse)
  .handler(async ({ data, context }) => {
    const sb = admin();
    const { data: txnId, error } = await sb.rpc("mpesa_topup", {
      _user: context.userId,
      _amount: data.amount,
    });
    if (error) throw new Error(error.message);
    await smsForTxn(txnId as string);
    return { ok: true, txnId };
  });

/* ================= GET TXN (for success screen) ================= */

export const getTransaction = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const sb = admin();
    const { data: txn, error } = await sb.from("transactions").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!txn) throw new Error("Transaction not found");
    if (txn.sender_id !== context.userId && txn.recipient_id !== context.userId) {
      throw new Error("Not authorized");
    }
    let recipientName: string | null = null;
    if (txn.recipient_id) {
      const { data: p } = await sb.from("profiles").select("full_name").eq("id", txn.recipient_id).maybeSingle();
      recipientName = p?.full_name ?? null;
    }
    if (!recipientName && txn.description?.startsWith("Send to ")) {
      recipientName = txn.description.replace(/^Send to /, "").replace(/\s+•.*$/, "");
    }
    return { txn, recipientName };
  });