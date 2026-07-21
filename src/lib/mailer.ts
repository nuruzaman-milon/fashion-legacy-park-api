import nodemailer, { Transporter } from "nodemailer";
import { env, isProduction } from "../config/env";
import ApiError from "../utils/ApiError";

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

class UnconfiguredMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    // Loud rather than silent: an email that never arrives in production is
    // a locked-out user, and this configuration is easy to forget on deploy.
    console.error(
      `[mailer] NO TRANSPORT CONFIGURED - dropped "${message.subject}" to ${message.to}`,
    );
  }
}

/**
 * Real transport over SMTP (Brevo, or any provider -- only .env changes).
 * EMAIL_FROM must be a sender address verified with the provider, or the
 * relay will reject the message.
 */
class SmtpMailer implements Mailer {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // 587/25 upgrade via STARTTLS instead
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      // Fail fast: the defaults wait up to 2 minutes on an unreachable relay,
      // holding the HTTP request open the whole time. 15s turns a bad network
      // moment into a quick 502 the client can retry.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });

    // Surface bad credentials at boot, not at the first signup. Non-fatal:
    // a transient network failure here should not take the API down.
    this.transporter.verify().then(
      () => console.log(`[mailer] SMTP transport ready (${env.SMTP_HOST})`),
      (err) => console.error("[mailer] SMTP verification failed:", err),
    );
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (err) {
      // The real cause goes to the server log; the client gets a clean 502.
      // The token row is already committed, so /resend-verification or a
      // retried /forgot-password recovers the flow.
      console.error(`[mailer] send failed for "${message.subject}":`, err);
      throw new ApiError(502, "Failed to send email. Please try again later.");
    }
  }
}

const smtpConfigured = Boolean(
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM,
);

export const mailer: Mailer = smtpConfigured
  ? new SmtpMailer()
  : isProduction
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
