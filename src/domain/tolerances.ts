import { prisma } from "@/lib/db";
import { d, gt } from "@/lib/money";

/**
 * Tolerans ayarları (mal kabul fazla teslimat + fatura miktar/fiyat toleransı).
 * Tenant.settings JSON içinde saklanır; yönetim panelinden değiştirilebilir.
 * Varsayılanlar makul kurumsal değerlerdir.
 */
export interface Tolerances {
  /** Mal kabulde sipariş miktarının üzerine izin verilen fazla teslimat yüzdesi */
  overReceiptPct: string;
  /** Fatura miktarı tolerans yüzdesi (üçlü eşleştirme) */
  invoiceQtyPct: string;
  /** Fatura birim fiyat tolerans yüzdesi */
  invoicePricePct: string;
  /** Fatura toplam tutar mutlak tolerans (para birimi bazında) */
  invoiceAmountAbs: string;
}

export const DEFAULT_TOLERANCES: Tolerances = {
  overReceiptPct: "5",
  invoiceQtyPct: "2",
  invoicePricePct: "2",
  invoiceAmountAbs: "10",
};

export async function getTolerances(tenantId: string): Promise<Tolerances> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(tenant?.settings ?? "{}");
  } catch {
    settings = {};
  }
  const t = (settings.tolerances ?? {}) as Partial<Tolerances>;
  return {
    overReceiptPct: t.overReceiptPct ?? DEFAULT_TOLERANCES.overReceiptPct,
    invoiceQtyPct: t.invoiceQtyPct ?? DEFAULT_TOLERANCES.invoiceQtyPct,
    invoicePricePct: t.invoicePricePct ?? DEFAULT_TOLERANCES.invoicePricePct,
    invoiceAmountAbs: t.invoiceAmountAbs ?? DEFAULT_TOLERANCES.invoiceAmountAbs,
  };
}

export async function saveTolerances(tenantId: string, next: Partial<Tolerances>): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(tenant?.settings ?? "{}");
  } catch {
    settings = {};
  }
  const current = (settings.tolerances ?? {}) as Partial<Tolerances>;
  settings.tolerances = { ...DEFAULT_TOLERANCES, ...current, ...next };
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: JSON.stringify(settings) } });
}

/** value, limit + tolerans% içinde mi? (true => tolerans dışı) */
export function exceedsByPct(value: string, limit: string, tolerancePct: string): boolean {
  const allowed = d(limit).plus(d(limit).times(d(tolerancePct).dividedBy(100)));
  return gt(value, allowed.toString());
}
