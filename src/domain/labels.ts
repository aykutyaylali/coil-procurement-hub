import type { Locale } from "@/lib/i18n";

/**
 * Modüllere özel enum değerleri için merkezî çift dilli etiketler.
 * (Durum kodları için src/lib/enums.ts, operasyon/landed için operations.ts.)
 * Hiçbir modül bu değerleri hard-coded yazmaz; label(code, locale) kullanır.
 */
const L: Record<string, { tr: string; en: string }> = {
  // Mal kabul disposition
  ACCEPTED: { tr: "Kabul", en: "Accepted" },
  PARTIAL: { tr: "Kısmi", en: "Partial" },
  DAMAGED: { tr: "Hasarlı", en: "Damaged" },
  WRONG_ITEM: { tr: "Yanlış Ürün", en: "Wrong Item" },
  REJECTED_DISP: { tr: "Ret", en: "Rejected" },
  QUARANTINE: { tr: "Karantina", en: "Quarantine" },
  RETURNED: { tr: "İade", en: "Returned" },
  // Kalite sonuç
  PASS: { tr: "Uygun", en: "Pass" },
  CONDITIONAL: { tr: "Şartlı Uygun", en: "Conditional" },
  FAIL: { tr: "Ret", en: "Fail" },
  // Kalite / NCR / CAPA
  MINOR: { tr: "Küçük", en: "Minor" },
  MAJOR: { tr: "Büyük", en: "Major" },
  CRITICAL: { tr: "Kritik", en: "Critical" },
  CORRECTIVE: { tr: "Düzeltici", en: "Corrective" },
  PREVENTIVE: { tr: "Önleyici", en: "Preventive" },
  "8D": { tr: "8D", en: "8D" },
  OPEN: { tr: "Açık", en: "Open" },
  IN_PROGRESS: { tr: "Devam Ediyor", en: "In Progress" },
  DONE: { tr: "Tamamlandı", en: "Done" },
  // Fatura kaynak
  MANUAL: { tr: "Manuel", en: "Manual" },
  UPLOAD: { tr: "Yükleme", en: "Upload" },
  EMAIL: { tr: "E-posta", en: "Email" },
  EINVOICE: { tr: "e-Fatura", en: "e-Invoice" },
  ERP: { tr: "ERP", en: "ERP" },
  // Ödeme durumu
  UNPAID: { tr: "Ödenmedi", en: "Unpaid" },
  PAID_PARTIAL: { tr: "Kısmi Ödendi", en: "Partially Paid" },
  // Genel
  YES: { tr: "Evet", en: "Yes" },
  NO: { tr: "Hayır", en: "No" },
};

export function label(code: string, locale: Locale = "tr"): string {
  return L[code]?.[locale] ?? code;
}

export const RECEIPT_DISPOSITIONS = ["ACCEPTED", "PARTIAL", "DAMAGED", "WRONG_ITEM", "REJECTED_DISP", "QUARANTINE"] as const;
export const QUALITY_RESULTS = ["PASS", "CONDITIONAL", "FAIL"] as const;
export const NCR_SEVERITIES = ["MINOR", "MAJOR", "CRITICAL"] as const;
export const CAPA_TYPES = ["CORRECTIVE", "PREVENTIVE", "8D"] as const;
export const CAPA_STATUSES = ["OPEN", "IN_PROGRESS", "DONE"] as const;

/**
 * disposition kodu -> GoodsReceiptLine.disposition şema değeri eşlemesi.
 * (Şemada REJECTED kullanılıyor; UI'da REJECTED_DISP ile çakışmayı önlemek için.)
 */
export function dispositionToSchema(code: string): string {
  return code === "REJECTED_DISP" ? "REJECTED" : code;
}
export function dispositionFromSchema(code: string): string {
  return code === "REJECTED" ? "REJECTED_DISP" : code;
}
