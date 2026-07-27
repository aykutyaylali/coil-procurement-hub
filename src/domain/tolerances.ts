import { prisma } from "@/lib/db";
import { d, gt } from "@/lib/money";

/**
 * Tolerans ayarlarÄ± (mal kabul fazla teslimat + fatura miktar/fiyat toleransÄ±).
 * Tenant.settings JSON iÃ§inde saklanÄ±r; yÃ¶netim panelinden deÄŸiÅŸtirilebilir.
 * VarsayÄ±lanlar makul kurumsal deÄŸerlerdir.
 */
export interface Tolerances {
  /** Mal kabulde sipariÅŸ miktarÄ±nÄ±n Ã¼zerine izin verilen fazla teslimat yÃ¼zdesi */
  overReceiptPct: string;
  /** Fatura miktarÄ± tolerans yÃ¼zdesi (Ã¼Ã§lÃ¼ eÅŸleÅŸtirme) */
  invoiceQtyPct: string;
  /** Fatura birim fiyat tolerans yÃ¼zdesi */
  invoicePricePct: string;
  /** Fatura toplam tutar mutlak tolerans (para birimi bazÄ±nda) */
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

/** value, limit + tolerans% iÃ§inde mi? (true => tolerans dÄ±ÅŸÄ±) */
export function exceedsByPct(value: string, limit: string, tolerancePct: string): boolean {
  const allowed = d(limit).plus(d(limit).times(d(tolerancePct).dividedBy(100)));
  return gt(value, allowed.toString());
}
