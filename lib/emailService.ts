import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

type SendEmailResult =
  | { success: true }
  | { success: false; error: string };

function toSafeString(value: unknown): string {
  return String(value || "").trim();
}

function isEmailConfigured(): boolean {
  return Boolean(toSafeString(process.env.EMAIL_USER) && toSafeString(process.env.EMAIL_PASS));
}

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: toSafeString(process.env.EMAIL_USER),
      pass: toSafeString(process.env.EMAIL_PASS),
    },
  });
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  const safeTo = toSafeString(to);
  const safeSubject = toSafeString(subject) || "Notification";
  const safeHtml = toSafeString(html);

  if (!isEmailConfigured()) {
    const error = "Email provider is not configured. Set EMAIL_USER and EMAIL_PASS.";
    console.error("[notifications:email] send failed - missing config", {
      to: safeTo,
      subject: safeSubject,
      error,
    });
    return { success: false, error };
  }

  if (!safeTo) {
    const error = "Recipient email is required.";
    console.error("[notifications:email] send failed - invalid recipient", {
      to: safeTo,
      subject: safeSubject,
      error,
    });
    return { success: false, error };
  }

  console.info("[notifications:email] sending", { to: safeTo, subject: safeSubject });

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: toSafeString(process.env.EMAIL_USER),
      to: safeTo,
      subject: safeSubject,
      html: safeHtml || "<p>You have a new notification.</p>",
    });

    console.info("[notifications:email] sent", { to: safeTo, subject: safeSubject });
    return { success: true };
  } catch (err) {
    const error = String((err as Error)?.message || "Unknown SMTP error");
    console.error("[notifications:email] send failed", {
      to: safeTo,
      subject: safeSubject,
      error,
    });
    return { success: false, error };
  }
}
