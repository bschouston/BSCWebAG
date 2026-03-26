import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@burhanisportsclub.com";
const FROM_NAME = process.env.RESEND_FROM_NAME ?? "Burhani Sports Club";
const FROM = `${FROM_NAME} <${FROM_EMAIL}>`;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://burhanisportsclub.com";
// RESEND_LOGO_URL can be set to a CDN/public URL for the logo.
// Falls back to SITE_URL/images/bsclogo.png — only works once deployed (not localhost).
const LOGO_URL = process.env.RESEND_LOGO_URL ?? `${SITE_URL}/images/bsclogo.png`;

// ── Brand ────────────────────────────────────────────────────────────────────
const brand = {
    navy:       "#1a3556",
    navyDark:   "#122540",
    gold:       "#FFD700",
    goldDark:   "#e6c200",
    white:      "#ffffff",
    offWhite:   "#f8fafc",
    border:     "#e2e8f0",
    text:       "#1e293b",
    muted:      "#64748b",
};


// ── Shared layout ────────────────────────────────────────────────────────────
function baseLayout(bodyContent: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Burhani Sports Club</title>
</head>
<body style="margin:0;padding:0;background:${brand.offWhite};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${brand.text};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${brand.offWhite};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:${brand.navy};border-radius:12px 12px 0 0;padding:0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:24px 32px;" valign="middle">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right:16px;" valign="middle">
                          <img src="${LOGO_URL}" alt="BSC Logo" width="52" height="52"
                            style="display:block;width:52px;height:52px;object-fit:contain;border-radius:6px;" />
                        </td>
                        <td valign="middle">
                          <span style="font-size:20px;font-weight:800;color:${brand.gold};letter-spacing:-0.3px;display:block;line-height:1.1;">
                            Burhani Sports Club
                          </span>
                          <span style="font-size:12px;color:rgba(255,255,255,0.6);letter-spacing:0.5px;text-transform:uppercase;">
                            Houston, Texas
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Gold accent bar -->
                <tr>
                  <td style="background:${brand.gold};height:3px;line-height:3px;font-size:1px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:${brand.white};border:1px solid ${brand.border};border-top:none;border-radius:0 0 12px 12px;padding:40px 40px 36px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 8px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:${brand.muted};">
                Burhani Sports Club &middot; Houston, TX
              </p>
              <p style="margin:0;font-size:12px;color:${brand.muted};">
                <a href="${SITE_URL}" style="color:${brand.navy};text-decoration:none;">burhanisportsclub.com</a>
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
    return `<table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="background:${brand.gold};border-radius:8px;">
          <a href="${href}"
            style="display:inline-block;background:${brand.gold};color:${brand.navy};font-weight:800;font-size:16px;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

function divider(): string {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td style="border-top:1px solid ${brand.border};font-size:1px;line-height:1px;">&nbsp;</td></tr>
    </table>`;
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

    const amountRow = amount
        ? `<tr>
            <td style="font-size:14px;color:${brand.muted};padding:8px 0 0;">Registration Fee</td>
            <td style="font-size:14px;font-weight:700;text-align:right;padding:8px 0 0;">$${amount.toFixed(2)}</td>
           </tr>`
        : "";

    const html = baseLayout(`
      <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:${brand.navy};">Registration Received!</h2>
      <p style="margin:0 0 28px;font-size:16px;color:${brand.muted};">
        Hi <strong style="color:${brand.text};">${name}</strong>, your details have been saved.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:${brand.offWhite};border:1px solid ${brand.border};border-radius:8px;padding:20px;margin-bottom:28px;">
        <tr>
          <td colspan="2" style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${brand.muted};padding-bottom:10px;">
            Registration Details
          </td>
        </tr>
        <tr>
          <td style="font-size:14px;color:${brand.muted};padding:8px 0 0;">Event</td>
          <td style="font-size:14px;font-weight:700;text-align:right;padding:8px 0 0;">${eventTitle}</td>
        </tr>
        ${amountRow}
        <tr>
          <td style="font-size:13px;color:${brand.muted};padding-top:10px;">Reference</td>
          <td style="font-size:13px;font-family:monospace;text-align:right;padding-top:10px;color:${brand.text};">${registrationId}</td>
        </tr>
      </table>

      <p style="margin:0 0 24px;font-size:15px;color:${brand.muted};">
        To secure your spot, complete your payment using the button below.
      </p>

      <div style="text-align:center;margin-bottom:28px;">
        ${ctaButton(resumeUrl, "Complete Payment →")}
      </div>

      ${divider()}
      <p style="margin:0;font-size:12px;color:${brand.muted};text-align:center;">
        Already paid? You can safely ignore this email. The button above will redirect you to payment — no need to re-fill the form.
      </p>
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

    const refRow = registrationId
        ? `<tr>
            <td style="font-size:13px;color:${brand.muted};padding-top:8px;border-top:1px solid ${brand.border};">Reference</td>
            <td style="font-size:13px;font-family:monospace;text-align:right;padding-top:8px;border-top:1px solid ${brand.border};color:${brand.text};">${registrationId}</td>
           </tr>`
        : "";

    const html = baseLayout(`
      <!-- Checkmark circle using table for email-client compatibility -->
      <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
        <tr>
          <td width="80" height="80" align="center" valign="middle"
            style="width:80px;height:80px;background:#dcfce7;border-radius:50%;">
            <img src="https://em-content.zobj.net/source/google/387/check-mark-button_2705.png"
              alt="✓" width="40" height="40"
              style="display:block;width:40px;height:40px;" />
          </td>
        </tr>
      </table>

      <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:${brand.navy};text-align:center;">Payment Confirmed!</h2>
      <p style="margin:0 0 28px;font-size:16px;color:${brand.muted};text-align:center;">
        Hi <strong style="color:${brand.text};">${name}</strong>, your spot is locked in.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:${brand.offWhite};border:1px solid ${brand.border};border-radius:8px;padding:20px;margin-bottom:28px;">
        <tr>
          <td colspan="2" style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${brand.muted};padding-bottom:10px;">
            Payment Summary
          </td>
        </tr>
        <tr>
          <td style="font-size:14px;color:${brand.muted};padding:8px 0 0;">Event</td>
          <td style="font-size:14px;font-weight:700;text-align:right;padding:8px 0 0;">${eventTitle}</td>
        </tr>
        <tr>
          <td style="font-size:15px;color:${brand.muted};padding:10px 0 0;border-top:1px solid ${brand.border};margin-top:8px;">Amount Paid</td>
          <td style="font-size:22px;font-weight:900;color:${brand.navy};text-align:right;padding:10px 0 0;border-top:1px solid ${brand.border};">
            $${amountPaid.toFixed(2)}
          </td>
        </tr>
        ${refRow}
      </table>

      <p style="margin:0 0 6px;font-size:15px;color:${brand.muted};">
        Your spot in the tournament is confirmed. We'll be in touch with further details as the event approaches.
      </p>
      ${divider()}
      <p style="margin:0;font-size:12px;color:${brand.muted};text-align:center;">
        A Stripe receipt has also been sent to this email address by our payment processor.
      </p>
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

    const amountRow = amount
        ? `<tr>
            <td style="font-size:14px;color:${brand.muted};padding:8px 0 0;">Amount Due</td>
            <td style="font-size:14px;font-weight:700;text-align:right;padding:8px 0 0;">$${amount.toFixed(2)}</td>
           </tr>`
        : "";

    const html = baseLayout(`
      <!-- Gold accent top bar inside body -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td style="background:${brand.gold};border-radius:6px;padding:12px 20px;">
            <span style="font-size:14px;font-weight:700;color:${brand.navy};">
              ⏰ &nbsp;Action Required — Payment Pending
            </span>
          </td>
        </tr>
      </table>

      <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:${brand.navy};">You left something behind!</h2>
      <p style="margin:0 0 28px;font-size:16px;color:${brand.muted};">
        Hi <strong style="color:${brand.text};">${name}</strong>, your registration for
        <strong style="color:${brand.text};">${eventTitle}</strong> is saved — but your payment is still pending.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:${brand.offWhite};border:1px solid ${brand.border};border-radius:8px;padding:20px;margin-bottom:28px;">
        <tr>
          <td colspan="2" style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${brand.muted};padding-bottom:10px;">
            Pending Registration
          </td>
        </tr>
        <tr>
          <td style="font-size:14px;color:${brand.muted};padding:8px 0 0;">Event</td>
          <td style="font-size:14px;font-weight:700;text-align:right;padding:8px 0 0;">${eventTitle}</td>
        </tr>
        ${amountRow}
        <tr>
          <td colspan="2" style="font-size:13px;color:${brand.muted};padding-top:12px;border-top:1px solid ${brand.border};">
            Spots are limited — complete your payment to guarantee your place.
          </td>
        </tr>
      </table>

      <div style="text-align:center;margin-bottom:28px;">
        ${ctaButton(resumeUrl, "Complete My Registration →")}
      </div>

      ${divider()}
      <p style="margin:0;font-size:12px;color:${brand.muted};text-align:center;">
        This button takes you directly to the payment page. No need to re-fill the form — your details are already saved.
      </p>
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
