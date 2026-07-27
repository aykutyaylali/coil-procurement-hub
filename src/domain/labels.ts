import type { Locale } from "@/lib/i18n";

/**
 * ModÃ¼llere Ã¶zel enum deÄŸerleri iÃ§in merkezÃ® Ã§ift dilli etiketler.
 * (Durum kodlarÄ± iÃ§in src/lib/enums.ts, operasyon/landed iÃ§in operations.ts.)
 * HiÃ§bir modÃ¼l bu deÄŸerleri hard-coded yazmaz; label(code, locale) kullanÄ±r.
 */
const L: Record<string, { tr: string; en: string }> = {
  // Mal kabul disposition
  ACCEPTED: { tr: "Kabul", en: "Accepted" },
  PARTIAL: { tr: "KÄ±smi", en: "Partial" },
  DAMAGED: { tr: "HasarlÄ±", en: "Damaged" },
  WRONG_ITEM: { tr: "YanlÄ±ÅŸ ÃœrÃ¼n", en: "Wrong Item" },
  REJECTED_DISP: { tr: "Ret", en: "Rejected" },
  QUARANTINE: { tr: "Karantina", en: "Quarantine" },
  RETURNED: { tr: "Ä°ade", en: "Returned" },
  // Kalite sonuÃ§
  PASS: { tr: "Uygun", en: "Pass" },
  CONDITIONAL: { tr: "ÅartlÄ± Uygun", en: "Conditional" },
  FAIL: { tr: "Ret", en: "Fail" },
  // Kalite / NCR / CAPA
  MINOR: { tr: "KÃ¼Ã§Ã¼k", en: "Minor" },
  MAJOR: { tr: "BÃ¼yÃ¼k", en: "Major" },
  CRITICAL: { tr: "Kritik", en: "Critical" },
  CORRECTIVE: { tr: "DÃ¼zeltici", en: "Corrective" },
  PREVENTIVE: { tr: "Ã–nleyici", en: "Preventive" },
  "8D": { tr: "8D", en: "8D" },
  OPEN: { tr: "AÃ§Ä±k", en: "Open" },
  IN_PROGRESS: { tr: "Devam Ediyor", en: "In Progress" },
  DONE: { tr: "TamamlandÄ±", en: "Done" },
  // Fatura kaynak
  MANUAL: { tr: "Manuel", en: "Manual" },
  UPLOAD: { tr: "YÃ¼kleme", en: "Upload" },
  EMAIL: { tr: "E-posta", en: "Email" },
  EINVOICE: { tr: "e-Fatura", en: "e-Invoice" },
  ERP: { tr: "ERP", en: "ERP" },
  // Ã–deme durumu
  UNPAID: { tr: "Ã–denmedi", en: "Unpaid" },
  PAID_PARTIAL: { tr: "KÄ±smi Ã–dendi", en: "Partially Paid" },
  // Genel
  YES: { tr: "Evet", en: "Yes" },
  NO: { tr: "HayÄ±r", en: "No" },
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
 * disposition kodu -> GoodsReceiptLine.disposition ÅŸema deÄŸeri eÅŸlemesi.
 * (Åemada REJECTED kullanÄ±lÄ±yor; UI'da REJECTED_DISP ile Ã§akÄ±ÅŸmayÄ± Ã¶nlemek iÃ§in.)
 */
export function dispositionToSchema(code: string): string {
  return code === "REJECTED_DISP" ? "REJECTED" : code;
}
export function dispositionFromSchema(code: string): string {
  return code === "REJECTED" ? "REJECTED_DISP" : code;
}
