// Systeemalerts doorsturen naar een Slack/Teams incoming webhook (ALERT_WEBHOOK_URL).
// De alert zelf staat altijd al in system_alerts (dashboard); dit is de push-notificatie erbovenop.
const ALERT_WEBHOOK_URL = Deno.env.get("ALERT_WEBHOOK_URL") ?? "";

export async function postAlertWebhook(
  kind: string,
  message: string,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  if (!ALERT_WEBHOOK_URL) return false;
  try {
    const text = `⚠️ Roll kleuradvies · ${kind}\n${message}\n\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``;
    const res = await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
