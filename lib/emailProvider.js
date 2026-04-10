import { sendEmail } from "@/lib/emailService";

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

export function isEmailConfigured() {
  return Boolean(toSafeString(process.env.EMAIL_USER) && toSafeString(process.env.EMAIL_PASS));
}

export async function sendNotificationEmail({ to, subject, message, actionUrl }) {
  if (!isEmailConfigured()) {
    throw new Error("Email provider is not configured. Set EMAIL_USER and EMAIL_PASS.");
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

  const result = await sendEmail({
    to: safeTo,
    subject: safeSubject,
    html,
  });

  if (!result.success) {
    throw new Error(`Email delivery failed: ${toSafeString(result.error || "Unknown SMTP error")}`);
  }

  return {
    provider: "nodemailer",
    messageId: "",
  };
}
