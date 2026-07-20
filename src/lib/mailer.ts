import { env, isProduction } from "../config/env";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development transport: prints the message instead of sending it, so the
 * verification and reset links are copy-pasteable straight from the terminal
 * and no SMTP account is needed to exercise the auth flow.
 */
class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    console.log(
      [
        "",
        "=".repeat(72),
        `  EMAIL (not actually sent -- ConsoleMailer)`,
        `  To:      ${message.to}`,
        `  Subject: ${message.subject}`,
        "-".repeat(72),
        message.text,
        "=".repeat(72),
        "",
      ].join("\n"),
    );
  }
}

/**
 * Swap this for a real transport when you pick a provider. Nothing outside this
 * file needs to change -- the auth service only knows about the Mailer
 * interface.
 *
 *   Nodemailer:  npm i nodemailer   -> implement send() with a transporter
 *   Resend:      npm i resend       -> implement send() with resend.emails.send
 */
class UnconfiguredMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    // Loud rather than silent: an email that never arrives in production is
    // a locked-out user, and this configuration is easy to forget on deploy.
    console.error(
      `[mailer] NO TRANSPORT CONFIGURED - dropped "${message.subject}" to ${message.to}`,
    );
  }
}

export const mailer: Mailer = isProduction
  ? new UnconfiguredMailer()
  : new ConsoleMailer();

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const buildVerificationEmail = (
  name: string,
  token: string,
): Omit<MailMessage, "to"> => {
  const link = `${env.CLIENT_URL}/verify-email?token=${token}`;
  return {
    subject: "Verify your email address",
    text: `Hi ${name},\n\nVerify your email to activate your account:\n\n${link}\n\nThis link expires in ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes.\n\nIf you did not create an account, you can ignore this email.`,
    html: `<p>Hi ${name},</p><p>Verify your email to activate your account:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${env.EMAIL_VERIFICATION_TTL_MINUTES} minutes.</p><p>If you did not create an account, you can ignore this email.</p>`,
  };
};

export const buildPasswordResetEmail = (
  name: string,
  token: string,
): Omit<MailMessage, "to"> => {
  const link = `${env.CLIENT_URL}/reset-password?token=${token}`;
  return {
    subject: "Reset your password",
    text: `Hi ${name},\n\nReset your password here:\n\n${link}\n\nThis link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.\n\nIf you did not request this, you can ignore this email -- your password will not change.`,
    html: `<p>Hi ${name},</p><p>Reset your password here:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.</p><p>If you did not request this, you can ignore this email &mdash; your password will not change.</p>`,
  };
};
