import { gte } from "@/lib/money";

/**
 * Talep onay politikası — SATINALMA belirler (hangi talep onaya gider).
 * "Tüm malzemeler onaya giderse iş yürümez" sorununa çözüm: satınalma bir eşik
 * belirler; eşiğin altındaki talepler onaya gitmeden doğrudan APPROVED olur.
 *
 * Politika Company.settings (JSON) içinde `reqApproval` anahtarında saklanır.
 */
export type ReqApprovalMode = "ALWAYS" | "THRESHOLD" | "NEVER";

export interface ReqApprovalPolicy {
  mode: ReqApprovalMode;
  /** THRESHOLD modunda: bu tutar ve ÜZERİ onaya gider (decimal-as-string). */
  threshold: string;
}

/**
 * Varsayılan: talep aşamasında onay YOK (NEVER). Talep açılınca doğrudan işleme
 * girer; satınalma teklif topladıktan sonra istersE sipariş (PO) aşamasında
 * yönetim onayına gönderir. Satınalma dilerse politikayı THRESHOLD/ALWAYS yapabilir.
 */
export const DEFAULT_REQ_APPROVAL_POLICY: ReqApprovalPolicy = { mode: "NEVER", threshold: "0" };

export const REQ_APPROVAL_MODE_LABELS: Record<ReqApprovalMode, { tr: string; en: string }> = {
  ALWAYS: { tr: "Her talep onaya gider", en: "Every requisition needs approval" },
  THRESHOLD: { tr: "Yalnızca eşik ve üzeri onaya gider", en: "Only at/above threshold needs approval" },
  NEVER: { tr: "Hiçbir talep onaya gitmez (satınalma doğrudan işler)", en: "No requisition needs approval" },
};

/** Company.settings JSON metninden politikayı güvenle okur. */
export function parseReqApprovalPolicy(companySettings: string | null | undefined): ReqApprovalPolicy {
  if (!companySettings) return DEFAULT_REQ_APPROVAL_POLICY;
  try {
    const s = JSON.parse(companySettings) as { reqApproval?: Partial<ReqApprovalPolicy> };
    const p = s.reqApproval;
    if (!p) return DEFAULT_REQ_APPROVAL_POLICY;
    const mode: ReqApprovalMode = p.mode === "THRESHOLD" || p.mode === "NEVER" ? p.mode : "ALWAYS";
    const threshold = typeof p.threshold === "string" && p.threshold.trim() ? p.threshold : "0";
    return { mode, threshold };
  } catch {
    return DEFAULT_REQ_APPROVAL_POLICY;
  }
}

/** Politikayı Company.settings JSON'una yazmak için birleştirir. */
export function mergeReqApprovalPolicy(companySettings: string | null | undefined, policy: ReqApprovalPolicy): string {
  let base: Record<string, unknown> = {};
  try {
    base = companySettings ? (JSON.parse(companySettings) as Record<string, unknown>) : {};
  } catch {
    base = {};
  }
  base.reqApproval = { mode: policy.mode, threshold: policy.threshold };
  return JSON.stringify(base);
}

/**
 * Bu tutardaki bir talep onaya gitmeli mi?
 * - NEVER  → hayır
 * - ALWAYS → evet
 * - THRESHOLD → tutar eşiğe eşit/büyükse evet
 */
export function requiresApproval(amount: string, policy: ReqApprovalPolicy): boolean {
  if (policy.mode === "NEVER") return false;
  if (policy.mode === "ALWAYS") return true;
  return gte(amount || "0", policy.threshold || "0");
}
