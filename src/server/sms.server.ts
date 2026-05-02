// Infobip SMS helper. Server-only (reads process.env). Never throws — SMS is best-effort.

function toMsisdn(phone: string): string | null {
  const d = (phone || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("254")) return d;
  if (d.startsWith("0")) return "254" + d.slice(1);
  if (d.length === 9) return "254" + d;
  return d;
}

export async function sendSms(toPhone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const sender = process.env.INFOBIP_SENDER || "MPESA";
  if (!apiKey || !baseUrl) {
    console.error("[infobip] missing config", { hasKey: !!apiKey, hasBaseUrl: !!baseUrl });
    return { ok: false, error: "Infobip not configured" };
  }
  const to = toMsisdn(toPhone);
  if (!to) {
    console.error("[infobip] invalid phone", toPhone);
    return { ok: false, error: "Invalid phone" };
  }

  const host = baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const url = `https://${host}/sms/2/text/advanced`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `App ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [{ from: sender, destinations: [{ to }], text }],
      }),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[infobip] send failed", res.status, body);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    console.log("[infobip] sent", { to, sender, status: res.status, body: body.slice(0, 400) });
    return { ok: true };
  } catch (e) {
    console.error("[infobip] error", e);
    return { ok: false, error: (e as Error).message };
  }
}
