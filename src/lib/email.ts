import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@burhanisportsclub.com";
const FROM_NAME = process.env.RESEND_FROM_NAME ?? "Burhani Sports Club";
const FROM = `${FROM_NAME} <${FROM_EMAIL}>`;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://burhanisportsclub.com";

// ── Shared design tokens ─────────────────────────────────────────────────────
const brand = {
    primary: "#1a56db",
    bg: "#f9fafb",
    card: "#ffffff",
    text: "#111827",
    muted: "#6b7280",
    border: "#e5e7eb",
};

function baseLayout(body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Burhani Sports Club</title>
</head>
<body style="margin:0;padding:0;background:${brand.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${brand.text};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${brand.bg};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:${brand.primary};border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Burhani Sports Club</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:${brand.card};border:1px solid ${brand.border};border-top:none;border-radius:0 0 12px 12px;padding:40px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:${brand.muted};">
                Burhani Sports Club · Houston, TX<br />
                <a href="${SITE_URL}" style="color:${brand.primary};">burhanisportsclub.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
    return `<a href="${href}" style="display:inline-block;background:${brand.primary};color:#ffffff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">${label}</a>`;
}

// ── 1. Registration Confirmation ─────────────────────────────────────────────

interface RegistrationConfirmationParams {
    to: string;
    name: string;
    eventTitle: string;
    eventId: string;
    registrationId: string;
    amount?: number;
}

export async function sendRegistrationConfirmation(params: RegistrationConfirmationParams) {
    const { to, name, eventTitle, eventId, registrationId, amount } = params;
    const resumeUrl = `${SITE_URL}/checkout/resume?eventId=${eventId}&registrationId=${registrationId}`;

    const amountLine = amount
        ? `<p style="margin:0 0 16px;font-size:15px;color:${brand.muted};">Registration fee: <strong style="color:${brand.text};">$${amount.toFixed(2)}</strong></p>`
        : "";

    const html = baseLayout(`
      <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;">Registration Confirmed!</h2>
      <p style="margin:0 0 24px;font-size:16px;color:${brand.muted};">Hi ${name}, your registration has been received.</p>

      <div style="background:${brand.bg};border:1px solid ${brand.border};border-radius:8px;padding:20px;margin-bottom:28px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${brand.muted};">Event</p>
        <p style="margin:0 0 16px;font-size:18px;font-weight:700;">${eventTitle}</p>
        ${amountLine}
        <p style="margin:0;font-size:13px;color:${brand.muted};">Registration ID: <code style="font-family:monospace;">${registrationId}</code></p>
      </div>

      <p style="margin:0 0 24px;font-size:15px;color:${brand.muted};">To secure your spot, please complete payment at your earliest convenience.</p>

      <div style="text-align:center;margin-bottom:28px;">
        ${ctaButton(resumeUrl, "Complete Payment →")}
      </div>

      <p style="margin:0;font-size:13px;color:${brand.muted};">If you already paid, you can ignore this email. The button above will redirect you straight to the payment page — no need to re-fill the form.</p>
    `);

    const { data, error } = await resend.emails.send({
        from: FROM,
        to,
        subject: `Registration received — ${eventTitle}`,
        html,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return data;
}

// ── 2. Payment Receipt ───────────────────────────────────────────────────────

interface PaymentReceiptParams {
    to: string;
    name: string;
    eventTitle: string;
    amountPaid: number;
    registrationId?: string;
}

export async function sendPaymentReceipt(params: PaymentReceiptParams) {
    const { to, name, eventTitle, amountPaid, registrationId } = params;

    const refLine = registrationId
        ? `<p style="margin:8px 0 0;font-size:13px;color:${brand.muted};">Reference: <code style="font-family:monospace;">${registrationId}</code></p>`
        : "";

    const html = baseLayout(`
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:#dcfce7;border-radius:50%;">
          <span style="font-size:32px;">✓</span>
        </div>
      </div>

      <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;text-align:center;">Payment Successful!</h2>
      <p style="margin:0 0 28px;font-size:16px;color:${brand.muted};text-align:center;">Hi ${name}, your payment has been confirmed.</p>

      <div style="background:${brand.bg};border:1px solid ${brand.border};border-radius:8px;padding:20px;margin-bottom:28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:14px;color:${brand.muted};padding:6px 0;">Event</td>
            <td style="font-size:14px;font-weight:600;text-align:right;padding:6px 0;">${eventTitle}</td>
          </tr>
          <tr>
            <td style="font-size:14px;color:${brand.muted};padding:6px 0;border-top:1px solid ${brand.border};">Amount Paid</td>
            <td style="font-size:18px;font-weight:800;color:${brand.primary};text-align:right;padding:6px 0;border-top:1px solid ${brand.border};">$${amountPaid.toFixed(2)}</td>
          </tr>
        </table>
        ${refLine}
      </div>

      <p style="margin:0 0 8px;font-size:15px;color:${brand.muted};">Your spot in the tournament is confirmed. We'll be in touch with further details as the event approaches.</p>
      <p style="margin:0;font-size:14px;color:${brand.muted};">A Stripe receipt has also been sent to this email address by our payment processor.</p>
    `);

    const { data, error } = await resend.emails.send({
        from: FROM,
        to,
        subject: `Payment confirmed — ${eventTitle}`,
        html,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return data;
}

// ── 3. Abandoned Cart Reminder ───────────────────────────────────────────────

interface AbandonedCartReminderParams {
    to: string;
    name: string;
    eventTitle: string;
    eventId: string;
    registrationId: string;
    amount?: number;
}

export async function sendAbandonedCartReminder(params: AbandonedCartReminderParams) {
    const { to, name, eventTitle, eventId, registrationId, amount } = params;
    const resumeUrl = `${SITE_URL}/checkout/resume?eventId=${eventId}&registrationId=${registrationId}`;

    const amountLine = amount
        ? `<p style="margin:0 0 8px;font-size:15px;color:${brand.muted};">Amount due: <strong style="color:${brand.text};">$${amount.toFixed(2)}</strong></p>`
        : "";

    const html = baseLayout(`
      <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;">You left something behind 🏐</h2>
      <p style="margin:0 0 24px;font-size:16px;color:${brand.muted};">Hi ${name}, your registration for <strong style="color:${brand.text};">${eventTitle}</strong> is saved — but your payment is still pending.</p>

      <div style="background:${brand.bg};border:1px solid ${brand.border};border-radius:8px;padding:20px;margin-bottom:28px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${brand.muted};">Pending Registration</p>
        <p style="margin:0 0 12px;font-size:18px;font-weight:700;">${eventTitle}</p>
        ${amountLine}
        <p style="margin:0;font-size:13px;color:${brand.muted};">Spots are limited — complete your payment to guarantee your place.</p>
      </div>

      <div style="text-align:center;margin-bottom:28px;">
        ${ctaButton(resumeUrl, "Complete My Registration →")}
      </div>

      <p style="margin:0;font-size:13px;color:${brand.muted};">This button takes you directly to the payment page. No need to re-fill the form — your details are already saved.</p>
    `);

    const { data, error } = await resend.emails.send({
        from: FROM,
        to,
        subject: `Your registration isn't complete yet — ${eventTitle}`,
        html,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return data;
}
