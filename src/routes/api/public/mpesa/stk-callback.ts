import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/mpesa/stk-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sb = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        let payload: { Body?: { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number; CallbackMetadata?: { Item?: { Name: string; Value?: string | number }[] } } } } = {};
        try { payload = await request.json(); } catch { return new Response("ok"); }
        const cb = payload.Body?.stkCallback;
        if (!cb?.CheckoutRequestID) return new Response("ok");

        const { data: txn } = await sb.from("transactions").select("id, recipient_id, amount, status").eq("checkout_request_id", cb.CheckoutRequestID).maybeSingle();
        if (!txn || txn.status !== "pending") return new Response("ok");

        if (cb.ResultCode === 0) {
          const items = cb.CallbackMetadata?.Item ?? [];
          const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value as string | undefined;
          await sb.from("transactions").update({ status: "completed", mpesa_receipt: receipt, raw_callback: payload as never, completed_at: new Date().toISOString() }).eq("id", txn.id);
          if (txn.recipient_id) await sb.rpc("transfer_funds", {
            _sender: txn.recipient_id, _recipient: txn.recipient_id, _amount: 0, _type: "mpesa_topup",
          } as never).then(() => {}); // noop placeholder
          // Credit wallet directly
          const { data: w } = await sb.from("wallets").select("balance").eq("user_id", txn.recipient_id!).single();
          await sb.from("wallets").update({ balance: Number(w?.balance ?? 0) + Number(txn.amount) }).eq("user_id", txn.recipient_id!);
        } else {
          await sb.from("transactions").update({ status: "failed", raw_callback: payload as never }).eq("id", txn.id);
        }
        return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});