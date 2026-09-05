/**
 * Email Service
 *
 * Transactional email delivery (email verification + password reset) built on
 * Nodemailer. Configured entirely from environment variables, so pointing it at
 * Gmail, SendGrid, Mailgun, Postmark, or any other SMTP relay needs zero code
 * changes.
 *
 * Graceful degradation: if SMTP is not configured (a fresh local dev machine,
 * or an org that hasn't wired email yet), the message is never raised to the
 * caller — the link is written to the console so the flow can still be
 * exercised end-to-end. Registration and password reset must never fail just
 * because the mail server is unreachable.
 */

import nodemailer, { type Transporter } from 'nodemailer';

const BRAND_NAME = 'Sahal Education Platform';
const BRAND_COLOR = '#059669';

let transporter: Transporter | null = null;

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter(): Transporter | null {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

/** First entry of the (possibly comma-separated) CLIENT_URL list. */
function clientBaseUrl(): string {
  const raw = process.env.CLIENT_URL || 'http://localhost:5173';
  return raw.split(',')[0].trim().replace(/\/+$/, '');
}

interface MailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendMail(payload: MailPayload): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) {
    // SMTP not configured — surface the link in the logs for local testing.
    console.log(`\n[EMAIL] SMTP not configured. Would send "${payload.subject}" to ${payload.to}:`);
    console.log(`[EMAIL] ${payload.text}\n`);
    return;
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM || `"${BRAND_NAME}" <${process.env.SMTP_USER}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  });
}

function wrapTemplate(
  title: string,
  heading: string,
  bodyHtml: string,
  actionLabel: string,
  actionUrl: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Inter,DM Sans,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f6f8;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
            <tr>
              <td style="background-color:${BRAND_COLOR};padding:24px 32px;border-radius:12px 12px 0 0;">
                <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${BRAND_NAME}</h1>
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
                <h2 style="margin:0 0 16px;color:#111827;font-size:18px;font-weight:700;">${heading}</h2>
                ${bodyHtml}
                <div style="margin:28px 0;text-align:center;">
                  <a href="${actionUrl}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;">${actionLabel}</a>
                </div>
                <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all;line-height:1.5;">${actionUrl}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;text-align:center;color:#9ca3af;font-size:12px;">
                This is an automated message from ${BRAND_NAME}. Please do not reply to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Send the email-verification message for a freshly created account.
 * The token is the raw verificationToken stored on the user (unhashed).
 */
export async function sendVerificationEmail(to: string, firstName: string, token: string): Promise<void> {
  const verifyUrl = `${clientBaseUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const text = `Welcome to ${BRAND_NAME}! Please verify your email address by opening this link:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`;
  const bodyHtml = `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Welcome to ${BRAND_NAME}! Please confirm your email address to complete your registration.</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;">This link expires in 24 hours.</p>`;

  await sendMail({
    to,
    subject: 'Verify your email address',
    html: wrapTemplate('Verify your email', 'Confirm your email address', bodyHtml, 'Verify Email', verifyUrl),
    text,
  });
}

/**
 * Send the password-reset message. The token is the raw, unhashed reset token
 * that the frontend submits back to POST /auth/reset-password/:token.
 */
export async function sendPasswordResetEmail(to: string, firstName: string, token: string): Promise<void> {
  const resetUrl = `${clientBaseUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const text = `We received a request to reset your password. Reset it here:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`;
  const bodyHtml = `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">We received a request to reset your password. Click the button below to choose a new one.</p>
    <p style="margin:0;color:#9ca3af;font-size:12px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`;

  await sendMail({
    to,
    subject: 'Reset your password',
    html: wrapTemplate('Reset your password', 'Reset your password', bodyHtml, 'Reset Password', resetUrl),
    text,
  });
}
