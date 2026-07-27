import { env } from "@/lib/env";

/**
 * E-posta şablonları (TR/EN). Basit ve markalı HTML.
 * Yeni şablonlar buraya eklenir; yönetim panelinden özelleştirilebilir yapıya hazır.
 */
type Locale = "tr" | "en";

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:640px;margin:0 auto;padding:24px">
    <div style="background:#0f172a;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;font-size:18px;font-weight:600">
      ${env.EMAIL_FROM_NAME}
    </div>
    <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
      <h2 style="margin:0 0 16px;font-size:20px">${title}</h2>
      ${bodyHtml}
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px">
      Bu e-posta ${env.EMAIL_FROM_NAME} tarafından otomatik gönderilmiştir.
    </p>
  </div></body></html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${label}</a>`;
}

export interface RfqInviteData {
  supplierName: string;
  rfqNumber: string;
  title: string;
  dueAt: string;
  companyName: string;
  magicLinkUrl: string;
  lineSummary: string; // düz metin özet
}

export function rfqInviteTemplate(data: RfqInviteData, locale: Locale = "tr") {
  if (locale === "en") {
    const subject = `Request for Quotation ${data.rfqNumber} - ${data.title}`;
    const html = layout(
      `Request for Quotation: ${data.rfqNumber}`,
      `<p>Dear ${data.supplierName},</p>
       <p>${data.companyName} invites you to submit a quotation.</p>
       <p><b>Subject:</b> ${data.title}<br/><b>Deadline:</b> ${data.dueAt}</p>
       <p><b>Items:</b><br/>${data.lineSummary}</p>
       <p style="margin:24px 0">${button(data.magicLinkUrl, "View & Respond to RFQ")}</p>
       <p style="color:#64748b;font-size:13px">This is a secure, single-use link valid until the deadline.</p>`,
    );
    const text = `RFQ ${data.rfqNumber} - ${data.title}\nDeadline: ${data.dueAt}\nRespond: ${data.magicLinkUrl}`;
    return { subject, html, text };
  }
  const subject = `Teklif Talebi ${data.rfqNumber} - ${data.title}`;
  const html = layout(
    `Teklif Talebi: ${data.rfqNumber}`,
    `<p>Sayın ${data.supplierName},</p>
     <p>${data.companyName} olarak sizden teklif vermenizi rica ediyoruz.</p>
     <p><b>Konu:</b> ${data.title}<br/><b>Son Teklif Tarihi:</b> ${data.dueAt}</p>
     <p><b>Kalemler:</b><br/>${data.lineSummary}</p>
     <p style="margin:24px 0">${button(data.magicLinkUrl, "Teklifi Görüntüle ve Yanıtla")}</p>
     <p style="color:#64748b;font-size:13px">Bu bağlantı size özel, tek kullanımlık ve son teklif tarihine kadar geçerlidir.</p>`,
  );
  const text = `Teklif Talebi ${data.rfqNumber} - ${data.title}\nSon Tarih: ${data.dueAt}\nYanıtlamak için: ${data.magicLinkUrl}`;
  return { subject, html, text };
}

export interface RfqReminderData {
  supplierName: string;
  rfqNumber: string;
  dueAt: string;
  magicLinkUrl: string;
}

export function rfqReminderTemplate(data: RfqReminderData, locale: Locale = "tr") {
  const subject =
    locale === "en"
      ? `Reminder: RFQ ${data.rfqNumber} deadline approaching`
      : `Hatırlatma: ${data.rfqNumber} teklif son tarihi yaklaşıyor`;
  const html = layout(
    locale === "en" ? "Quotation Reminder" : "Teklif Hatırlatması",
    locale === "en"
      ? `<p>Dear ${data.supplierName},</p><p>The deadline for RFQ <b>${data.rfqNumber}</b> is <b>${data.dueAt}</b>. Please submit your quotation.</p><p style="margin:24px 0">${button(data.magicLinkUrl, "Respond Now")}</p>`
      : `<p>Sayın ${data.supplierName},</p><p><b>${data.rfqNumber}</b> numaralı teklif talebinin son tarihi <b>${data.dueAt}</b>. Lütfen teklifinizi iletiniz.</p><p style="margin:24px 0">${button(data.magicLinkUrl, "Şimdi Yanıtla")}</p>`,
  );
  const text = `${data.rfqNumber} - ${data.dueAt}\n${data.magicLinkUrl}`;
  return { subject, html, text };
}

export interface PoSentData {
  supplierName: string;
  poNumber: string;
  companyName: string;
  total: string;
  magicLinkUrl: string;
}

export function poSentTemplate(data: PoSentData, locale: Locale = "tr") {
  const subject =
    locale === "en"
      ? `Purchase Order ${data.poNumber}`
      : `Satınalma Siparişi ${data.poNumber}`;
  const html = layout(
    locale === "en" ? `Purchase Order ${data.poNumber}` : `Satınalma Siparişi ${data.poNumber}`,
    locale === "en"
      ? `<p>Dear ${data.supplierName},</p><p>${data.companyName} has issued purchase order <b>${data.poNumber}</b> (Total: ${data.total}).</p><p style="margin:24px 0">${button(data.magicLinkUrl, "Review & Confirm Order")}</p>`
      : `<p>Sayın ${data.supplierName},</p><p>${data.companyName} tarafından <b>${data.poNumber}</b> numaralı satınalma siparişi oluşturuldu (Toplam: ${data.total}).</p><p style="margin:24px 0">${button(data.magicLinkUrl, "Siparişi İncele ve Teyit Et")}</p>`,
  );
  const text = `${data.poNumber} - ${data.total}\n${data.magicLinkUrl}`;
  return { subject, html, text };
}

export interface GenericNotifyData {
  title: string;
  message: string;
  linkUrl?: string;
  linkLabel?: string;
}

export function genericNotifyTemplate(data: GenericNotifyData) {
  const html = layout(
    data.title,
    `<p>${data.message}</p>${
      data.linkUrl ? `<p style="margin:24px 0">${button(data.linkUrl, data.linkLabel ?? "Görüntüle")}</p>` : ""
    }`,
  );
  return { subject: data.title, html, text: `${data.title}\n${data.message}\n${data.linkUrl ?? ""}` };
}
