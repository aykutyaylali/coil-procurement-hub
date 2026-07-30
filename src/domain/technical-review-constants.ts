/** Teknik İnceleme sabitleri (SAF — client + server ortak; server-only bağımlılığı yok). */

export const REVIEW_TYPES = ["DIMENSION", "MATERIAL", "PROCESS", "TOLERANCE", "SUBSTITUTION", "OTHER"] as const;
export const REVIEW_ACTIONS = ["APPROVE", "REJECT", "REQUEST_INFO", "SUGGEST_ALTERNATIVE", "FORWARD", "INTERNAL_NOTE"] as const;
export const REVIEW_RISKS = ["LOW", "MEDIUM", "HIGH"] as const;
export const REVIEW_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

/** Karar aksiyonu → yeni durum. INTERNAL_NOTE durumu değiştirmez. */
export const STATUS_BY_ACTION: Record<string, string> = {
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  REQUEST_INFO: "INFO_REQUESTED",
  SUGGEST_ALTERNATIVE: "ALTERNATIVE_SUGGESTED",
  FORWARD: "FORWARDED",
};
