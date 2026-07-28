/**
 * Uygulama sabitleri (SQLite'ta native enum olmadığı için String + sabit).
 * PostgreSQL'e geçişte native enum'a dönüştürülebilir.
 * Her enum için Türkçe etiket haritası UI'da kullanılır.
 */

export const RequisitionStatus = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  ASSIGNED: "ASSIGNED",
  IN_RFQ: "IN_RFQ",
  ORDERED: "ORDERED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;
export type RequisitionStatus = (typeof RequisitionStatus)[keyof typeof RequisitionStatus];

export const RFQStatus = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  SENT: "SENT",
  OPEN: "OPEN",
  CLARIFICATION: "CLARIFICATION",
  EVALUATION: "EVALUATION",
  NEGOTIATION: "NEGOTIATION",
  AWARDED: "AWARDED",
  CANCELLED: "CANCELLED",
  CLOSED: "CLOSED",
} as const;
export type RFQStatus = (typeof RFQStatus)[keyof typeof RFQStatus];

export const OrderStatus = {
  DRAFT: "DRAFT",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  SENT: "SENT",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  PARTIALLY_CONFIRMED: "PARTIALLY_CONFIRMED",
  CONFIRMED: "CONFIRMED",
  PARTIALLY_SHIPPED: "PARTIALLY_SHIPPED",
  SHIPPED: "SHIPPED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  RECEIVED: "RECEIVED",
  INVOICED: "INVOICED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const BidStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  REVISED: "REVISED",
  SHORTLISTED: "SHORTLISTED",
  AWARDED: "AWARDED",
  REJECTED: "REJECTED",
} as const;
export type BidStatus = (typeof BidStatus)[keyof typeof BidStatus];

export const SupplierStatus = {
  DRAFT: "DRAFT",
  ONBOARDING: "ONBOARDING",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  BLACKLISTED: "BLACKLISTED",
  INACTIVE: "INACTIVE",
} as const;
export type SupplierStatus = (typeof SupplierStatus)[keyof typeof SupplierStatus];

export const InvoiceStatus = {
  DRAFT: "DRAFT",
  MATCHING: "MATCHING",
  MATCHED: "MATCHED",
  BLOCKED: "BLOCKED",
  APPROVED: "APPROVED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const Priority = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

// --- Türkçe etiketler ---
export const STATUS_LABELS_TR: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay Bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
  ASSIGNED: "Satınalma İşleme Aldı",
  IN_RFQ: "Teklifler toplanıyor",
  ORDERED: "Sipariş Verildi",
  CLOSED: "Kapandı",
  CANCELLED: "İptal Edildi",
  SENT: "Gönderildi",
  OPEN: "Açık",
  CLARIFICATION: "Açıklama",
  EVALUATION: "Değerlendirme",
  NEGOTIATION: "Pazarlık",
  AWARDED: "Karara Bağlandı",
  ACKNOWLEDGED: "Teyit Alındı",
  PARTIALLY_CONFIRMED: "Kısmi Teyit",
  CONFIRMED: "Teyit Edildi",
  PARTIALLY_SHIPPED: "Kısmi Sevk",
  SHIPPED: "Sevk Edildi",
  PARTIALLY_RECEIVED: "Kısmi Teslim",
  RECEIVED: "Teslim Alındı",
  INVOICED: "Faturalandı",
  SUBMITTED: "Gönderildi",
  REVISED: "Revize Edildi",
  SHORTLISTED: "Kısa Listede",
  ONBOARDING: "Kayıt Sürecinde",
  ACTIVE: "Aktif",
  BLACKLISTED: "Kara Listede",
  INACTIVE: "Pasif",
  MATCHING: "Eşleştiriliyor",
  MATCHED: "Eşleşti",
  BLOCKED: "Bloke",
  PAID: "Ödendi",
  LOW: "Düşük",
  NORMAL: "Normal",
  HIGH: "Yüksek",
  URGENT: "Acil",
};

// --- İngilizce etiketler (TR ile aynı anahtar kümesi; test edilir) ---
export const STATUS_LABELS_EN: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ASSIGNED: "In Procurement",
  IN_RFQ: "Collecting Quotes",
  ORDERED: "Ordered",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  SENT: "Sent",
  OPEN: "Open",
  CLARIFICATION: "Clarification",
  EVALUATION: "Evaluation",
  NEGOTIATION: "Negotiation",
  AWARDED: "Awarded",
  ACKNOWLEDGED: "Acknowledged",
  PARTIALLY_CONFIRMED: "Partially Confirmed",
  CONFIRMED: "Confirmed",
  PARTIALLY_SHIPPED: "Partially Shipped",
  SHIPPED: "Shipped",
  PARTIALLY_RECEIVED: "Partially Received",
  RECEIVED: "Received",
  INVOICED: "Invoiced",
  SUBMITTED: "Submitted",
  REVISED: "Revised",
  SHORTLISTED: "Shortlisted",
  ONBOARDING: "Onboarding",
  ACTIVE: "Active",
  BLACKLISTED: "Blacklisted",
  INACTIVE: "Inactive",
  MATCHING: "Matching",
  MATCHED: "Matched",
  BLOCKED: "Blocked",
  PAID: "Paid",
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export function statusLabel(status: string, locale = "tr"): string {
  if (locale === "tr") return STATUS_LABELS_TR[status] ?? status;
  return (
    STATUS_LABELS_EN[status] ??
    status
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ")
  );
}

/** Durum rozeti renk sınıfı (Tailwind) */
export function statusTone(status: string): "default" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "APPROVED":
    case "ACTIVE":
    case "CONFIRMED":
    case "RECEIVED":
    case "MATCHED":
    case "PAID":
    case "AWARDED":
      return "success";
    case "PENDING_APPROVAL":
    case "CLARIFICATION":
    case "NEGOTIATION":
    case "ONBOARDING":
    case "MATCHING":
    case "PARTIALLY_RECEIVED":
    case "PARTIALLY_SHIPPED":
    case "PARTIALLY_CONFIRMED":
      return "warning";
    case "REJECTED":
    case "CANCELLED":
    case "BLACKLISTED":
    case "BLOCKED":
      return "danger";
    case "SENT":
    case "OPEN":
    case "EVALUATION":
    case "IN_RFQ":
    case "SUBMITTED":
    case "ACKNOWLEDGED":
    case "INVOICED":
      return "info";
    default:
      return "default";
  }
}
