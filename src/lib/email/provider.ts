import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export interface OutboundEmail {
  to: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  messageId: string;
  provider: string;
}

export interface EmailProvider {
  readonly name: string;
  send(email: OutboundEmail): Promise<SendResult>;
}

/**
 * MOCK sağlayıcı: Gerçek gönderim yapmaz; e-postayı konsola loglar.
 * Geliştirme ve test için varsayılan. Gönderilen içerik EmailMessage
 * kaydında saklandığından UI'daki "E-posta İşlem Merkezi"nden görülebilir.
 */
class MockProvider implements EmailProvider {
  readonly name = "mock";
  async send(email: OutboundEmail): Promise<SendResult> {
    console.info(
      `\n[MOCK EMAIL] -> ${email.to}\n  Konu: ${email.subject}\n  Reply-To: ${email.replyTo ?? "-"}\n`,
    );
    return { messageId: `mock-${Date.now()}-${Math.round(Math.random() * 1e6)}`, provider: "mock" };
  }
}

class SmtpProvider implements EmailProvider {
  readonly name = "smtp";
  private transporter;
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE ?? false,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  async send(email: OutboundEmail): Promise<SendResult> {
    const info = await this.transporter.sendMail({
      from: email.fromName ? `"${email.fromName}" <${email.from}>` : email.from,
      to: email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return { messageId: info.messageId, provider: "smtp" };
  }
}

/** Microsoft 365 / Graph — Uygulama izniyle sendMail. Kurulum: docs/email-graph.md */
class GraphProvider implements EmailProvider {
  readonly name = "graph";
  private async token(): Promise<string> {
    const tenant = process.env.MS_GRAPH_TENANT_ID;
    const clientId = process.env.MS_GRAPH_CLIENT_ID;
    const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
    if (!tenant || !clientId || !clientSecret) {
      throw new Error("Microsoft Graph yapılandırması eksik (MS_GRAPH_* .env değişkenleri).");
    }
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) throw new Error(`Graph token alınamadı: ${res.status}`);
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }
  async send(email: OutboundEmail): Promise<SendResult> {
    const sender = process.env.MS_GRAPH_SENDER_UPN;
    if (!sender) throw new Error("MS_GRAPH_SENDER_UPN tanımlı değil.");
    const accessToken = await this.token();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: email.subject,
            body: { contentType: "HTML", content: email.html },
            toRecipients: [{ emailAddress: { address: email.to } }],
            replyTo: email.replyTo
              ? [{ emailAddress: { address: email.replyTo } }]
              : undefined,
          },
          saveToSentItems: true,
        }),
      },
    );
    if (!res.ok) throw new Error(`Graph sendMail hatası: ${res.status} ${await res.text()}`);
    return { messageId: `graph-${Date.now()}`, provider: "graph" };
  }
}

class SendGridProvider implements EmailProvider {
  readonly name = "sendgrid";
  async send(email: OutboundEmail): Promise<SendResult> {
    const key = process.env.SENDGRID_API_KEY;
    if (!key) throw new Error("SENDGRID_API_KEY tanımlı değil.");
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email.to }] }],
        from: { email: email.from, name: email.fromName },
        reply_to: email.replyTo ? { email: email.replyTo } : undefined,
        subject: email.subject,
        content: [
          { type: "text/plain", value: email.text },
          { type: "text/html", value: email.html },
        ],
      }),
    });
    if (!res.ok && res.status !== 202)
      throw new Error(`SendGrid hatası: ${res.status} ${await res.text()}`);
    return { messageId: res.headers.get("x-message-id") ?? `sendgrid-${Date.now()}`, provider: "sendgrid" };
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  switch (env.EMAIL_PROVIDER) {
    case "smtp":
      cached = new SmtpProvider();
      break;
    case "graph":
      cached = new GraphProvider();
      break;
    case "sendgrid":
      cached = new SendGridProvider();
      break;
    case "ses":
      // SES için SMTP arayüzü kullanılabilir; ayrı SDK yerine SMTP önerilir.
      cached = new SmtpProvider();
      break;
    case "mock":
    default:
      cached = new MockProvider();
  }
  return cached;
}
