/**
 * Outbound-only Telegram push for hermes-bridge (Spec D, D11-D14).
 *
 * No dependency: Node 18+ has global fetch and this is one HTTP POST.
 * No inbound path: notifications are deep links, not callback buttons —
 * approving from a phone should still show the conversation that produced
 * the request (Fable §4.2).
 *
 * Unset TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID ⇒ every call is a no-op that
 * returns false. A missing bot must never break the queue loop.
 */
const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT  = () => process.env.TELEGRAM_CHAT_ID  || "";

export const telegramEnabled = () => Boolean(TOKEN() && CHAT());

export function baseUrl() {
  return (process.env.MYHQ_BASE_URL || "https://myhq.digivisions.net").replace(/\/+$/, "");
}

/** Plain text only — no parse_mode, so no escaping can ever 400 us (D14). */
export async function sendMessage(text, { chatId = CHAT(), silent = false } = {}) {
  if (!telegramEnabled()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
        disable_notification: silent,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(new Date().toISOString(), `telegram: send failed ${res.status} ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.log(new Date().toISOString(), "telegram: send error", e.message);
    return false;
  }
}

/**
 * Inbound, short-poll (Spec F, F-8 / F-D8). `getUpdates` needs no ingress at
 * all — no public route accepting unauthenticated POSTs, no `setWebhook`
 * deploy step — and keeps every line of bot code in this file. `timeout=0` is
 * deliberate: a long poll would hold a connection across the 30s mirror tick.
 *
 * Never throws and never returns anything but an array; the caller runs
 * inside the mirror tick and must not be able to die here.
 *
 * 409 means a webhook is registered — `getUpdates` and a webhook are mutually
 * exclusive. Logged once by the caller, then inbound stays dark.
 */
let warned409 = false;
export async function getUpdates(offset = 0) {
  if (!telegramEnabled()) return [];
  try {
    const url = `https://api.telegram.org/bot${TOKEN()}/getUpdates`
      + `?offset=${Number(offset) || 0}&timeout=0&limit=20`
      + `&allowed_updates=${encodeURIComponent('["message"]')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      if (res.status === 409) {
        if (!warned409) {
          warned409 = true;
          console.log(new Date().toISOString(),
            "telegram: getUpdates 409 — a webhook is registered; inbound disabled");
        }
        return [];
      }
      console.log(new Date().toISOString(), `telegram: getUpdates failed ${res.status}`);
      return [];
    }
    const body = await res.json();
    return Array.isArray(body?.result) ? body.result : [];
  } catch (e) {
    console.log(new Date().toISOString(), "telegram: getUpdates error", e.message);
    return [];
  }
}

const trunc = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "");

/** The approval alert. Client · title · deep link into the thread. */
export function approvalMessage({ clientName, clientSlug, title, kind, flagReason }) {
  const who  = clientName || clientSlug || "Hermes";
  const why  = flagReason ? ` (${flagReason})` : "";
  const link = clientSlug ? `${baseUrl()}/clients/${clientSlug}` : `${baseUrl()}/approvals`;
  return [
    `⚡ Cần duyệt · ${who}${why}`,
    "",
    trunc(title, 180),
    "",
    `${kind} · ${link}`,
  ].join("\n");
}
