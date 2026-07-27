import type { Tx } from "@/lib/db";

/**
 * Belge numarası üretimi. Aynı transaction içinde çağrılmalı ve
 * eşzamanlılık güvenliği için mevcut en yüksek numaraya göre artırır.
 * Format: PREFIX-YIL-000001
 */
const PREFIXES = {
  REQUISITION: "TLP",
  RFQ: "RFQ",
  PURCHASE_ORDER: "SIP",
  GOODS_RECEIPT: "MKB",
  INVOICE: "FAT",
  CONTRACT: "SZL",
  SUPPLIER: "TED",
  CAPA: "CAPA",
  NONCONFORMANCE: "UYG",
} as const;

export type NumberedEntity = keyof typeof PREFIXES;

export async function nextNumber(
  tx: Tx,
  tenantId: string,
  entity: NumberedEntity,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = PREFIXES[entity];
  const pattern = `${prefix}-${year}-`;

  // İlgili tablodan bu yıl+prefix ile başlayan en yüksek numarayı bul
  let lastNumber = "";
  switch (entity) {
    case "REQUISITION": {
      const last = await tx.purchaseRequisition.findFirst({
        where: { tenantId, number: { startsWith: pattern } },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      lastNumber = last?.number ?? "";
      break;
    }
    case "RFQ": {
      const last = await tx.rFQ.findFirst({
        where: { tenantId, number: { startsWith: pattern } },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      lastNumber = last?.number ?? "";
      break;
    }
    case "PURCHASE_ORDER": {
      const last = await tx.purchaseOrder.findFirst({
        where: { tenantId, number: { startsWith: pattern } },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      lastNumber = last?.number ?? "";
      break;
    }
    case "GOODS_RECEIPT": {
      const last = await tx.goodsReceipt.findFirst({
        where: { number: { startsWith: pattern } },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      lastNumber = last?.number ?? "";
      break;
    }
    case "CONTRACT": {
      const last = await tx.contract.findFirst({
        where: { tenantId, code: { startsWith: pattern } },
        orderBy: { code: "desc" },
        select: { code: true },
      });
      lastNumber = last?.code ?? "";
      break;
    }
    case "SUPPLIER": {
      const last = await tx.supplier.findFirst({
        where: { tenantId, code: { startsWith: pattern } },
        orderBy: { code: "desc" },
        select: { code: true },
      });
      lastNumber = last?.code ?? "";
      break;
    }
    default:
      lastNumber = "";
  }

  const lastSeq = lastNumber ? parseInt(lastNumber.slice(pattern.length), 10) || 0 : 0;
  const nextSeq = lastSeq + 1;
  return `${pattern}${String(nextSeq).padStart(6, "0")}`;
}
