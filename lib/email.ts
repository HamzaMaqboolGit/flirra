import { Resend } from "resend";
import { getSettings } from "./settings";

export async function sendEmail(to: string, subject: string, html: string) {
  const settings = await getSettings().catch(() => null);
  const from = process.env.EMAIL_FROM || settings?.emailFrom || "Velora <hello@velora.local>";
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email] ${to} :: ${subject}\n${html.replace(/<[^>]+>/g, " ")}`);
    return { delivered: false, reason: "RESEND_API_KEY is not configured" };
  }
  const resend = new Resend(key);
  await resend.emails.send({ from, to, subject, html });
  return { delivered: true };
}

export function verificationEmail(name: string, url: string) {
  return {
    subject: "Confirm your Velora email",
    html: `<p>Hello ${escapeHtml(name)},</p><p>Confirm your email to activate your 18+ Velora account.</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours. If you did not create an account, ignore this message.</p>`,
  };
}

export function resetEmail(name: string, url: string) {
  return {
    subject: "Reset your Velora password",
    html: `<p>Hello ${escapeHtml(name)},</p><p><a href="${url}">Choose a new password</a></p><p>This link expires in 1 hour. If you did not ask for a reset, you can ignore this email.</p>`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

export function verificationCodeEmail(name: string, code: string) {
  return {
    subject: 'Your Flirra verification code',
    html: `<p>Hello ${escapeHtml(name)},</p><p>Enter this code in Flirra to confirm your email address:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${escapeHtml(code)}</p><p>This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>`,
  };
}
