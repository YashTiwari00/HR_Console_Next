const RESEND_API_URL = "https://api.resend.com/emails";

function toSafeString(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toAbsoluteUrl(pathOrUrl) {
  const raw = toSafeString(pathOrUrl);
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const appOrigin =
    toSafeString(process.env.NEXT_PUBLIC_APP_ORIGIN) ||
    toSafeString(process.env.SMOKE_BASE_URL) ||
    "http://localhost:3000";

  return `${appOrigin.replace(/\/$/, "")}/${raw.replace(/^\//, "")}`;
}

export function isResendConfigured() {
  return Boolean(toSafeString(process.env.RESEND_API_KEY) && toSafeString(process.env.NOTIFICATION_EMAIL_FROM));
}

export async function sendNotificationEmail({ to, subject, message, actionUrl }) {
  const apiKey = toSafeString(process.env.RESEND_API_KEY);
  const from = toSafeString(process.env.NOTIFICATION_EMAIL_FROM);
  const replyTo = toSafeString(process.env.NOTIFICATION_EMAIL_REPLY_TO);

  if (!apiKey || !from) {
    throw new Error("Email provider is not configured. Set RESEND_API_KEY and NOTIFICATION_EMAIL_FROM.");
  }

  const safeTo = toSafeString(to);
  if (!safeTo) {
    throw new Error("Recipient email is required.");
  }

  const safeSubject = toSafeString(subject) || "Notification";
  const safeMessage = toSafeString(message) || "You have a new notification.";
  const safeActionUrl = toAbsoluteUrl(actionUrl);

  const html = [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.5;color:#111;\">",
    `<h2 style=\"margin:0 0 12px;\">${escapeHtml(safeSubject)}</h2>`,
    `<p style=\"margin:0 0 14px;\">${escapeHtml(safeMessage)}</p>`,
    safeActionUrl
      ? `<p style=\"margin:0 0 14px;\"><a href=\"${escapeHtml(
          safeActionUrl
        )}\" style=\"display:inline-block;padding:10px 14px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px;\">Open notification</a></p>`
      : "",
    "</div>",
  ].join("");

  const text = safeActionUrl
    ? `${safeSubject}\n\n${safeMessage}\n\nOpen: ${safeActionUrl}`
    : `${safeSubject}\n\n${safeMessage}`;

  const payload = {
    from,
    to: [safeTo],
    subject: safeSubject,
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = toSafeString(body?.message || body?.error || response.statusText || "Unknown email error");
    throw new Error(`Resend delivery failed: ${details}`);
  }

  return {
    provider: "resend",
    messageId: toSafeString(body?.id),
  };
}
