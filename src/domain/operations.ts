import type { Locale } from "@/lib/i18n";

/** Operasyon türü ve ilişkili sabitler (yurt içi / ithalat / ihracat bağlantılı). */
export const OperationType = {
  DOMESTIC_PURCHASE: "DOMESTIC_PURCHASE",
  IMPORT_PURCHASE: "IMPORT_PURCHASE",
  EXPORT_RELATED_PURCHASE: "EXPORT_RELATED_PURCHASE",
} as const;
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export const PaymentMethod = {
  CASH_ADVANCE: "CASH_ADVANCE",
  WIRE: "WIRE",
  CAD: "CAD",
  LC: "LC",
  ACCREDITIVE: "ACCREDITIVE",
  OTHER: "OTHER",
} as const;

export const TransportMode = {
  ROAD: "ROAD",
  AIR: "AIR",
  SEA: "SEA",
  RAIL: "RAIL",
  COURIER: "COURIER",
} as const;

export const LandedCostType = {
  FREIGHT: "FREIGHT",
  INSURANCE: "INSURANCE",
  CUSTOMS_DUTY: "CUSTOMS_DUTY",
  EXTRA_CUSTOMS_DUTY: "EXTRA_CUSTOMS_DUTY",
  STAMP_TAX: "STAMP_TAX",
  STORAGE: "STORAGE",
  ORDINO: "ORDINO",
  BROKERAGE: "BROKERAGE",
  PORT: "PORT",
  OTHER: "OTHER",
} as const;

export const AllocationMethod = {
  QUANTITY: "QUANTITY",
  WEIGHT: "WEIGHT",
  VOLUME: "VOLUME",
  VALUE: "VALUE",
} as const;

// Çift dilli etiketler
const LABELS: Record<string, { tr: string; en: string }> = {
  DOMESTIC_PURCHASE: { tr: "Yurt İçi Satınalma", en: "Domestic Purchase" },
  IMPORT_PURCHASE: { tr: "İthalat", en: "Import" },
  EXPORT_RELATED_PURCHASE: { tr: "İhracat Bağlantılı", en: "Export-Related" },
  CASH_ADVANCE: { tr: "Peşin", en: "Cash in Advance" },
  WIRE: { tr: "Havale/EFT", en: "Wire Transfer" },
  CAD: { tr: "Vesaik Mukabili (CAD)", en: "Cash Against Documents" },
  LC: { tr: "Akreditif (LC)", en: "Letter of Credit" },
  ACCREDITIVE: { tr: "Akreditif", en: "Accreditive" },
  OTHER: { tr: "Diğer", en: "Other" },
  ROAD: { tr: "Karayolu", en: "Road" },
  AIR: { tr: "Havayolu", en: "Air" },
  SEA: { tr: "Denizyolu", en: "Sea" },
  RAIL: { tr: "Demiryolu", en: "Rail" },
  COURIER: { tr: "Kurye", en: "Courier" },
  FREIGHT: { tr: "Navlun", en: "Freight" },
  INSURANCE: { tr: "Sigorta", en: "Insurance" },
  CUSTOMS_DUTY: { tr: "Gümrük Vergisi", en: "Customs Duty" },
  EXTRA_CUSTOMS_DUTY: { tr: "İlave Gümrük Vergisi", en: "Extra Customs Duty" },
  STAMP_TAX: { tr: "Damga Vergisi", en: "Stamp Tax" },
  STORAGE: { tr: "Ardiye", en: "Storage" },
  ORDINO: { tr: "Ordino", en: "Delivery Order" },
  BROKERAGE: { tr: "Müşavirlik", en: "Brokerage" },
  PORT: { tr: "Liman Masrafı", en: "Port Charges" },
  QUANTITY: { tr: "Miktara Göre", en: "By Quantity" },
  WEIGHT: { tr: "Ağırlığa Göre", en: "By Weight" },
  VOLUME: { tr: "Hacme Göre", en: "By Volume" },
  VALUE: { tr: "Değere Göre", en: "By Value" },
};

export function opLabel(code: string, locale: Locale = "tr"): string {
  return LABELS[code]?.[locale] ?? code;
}

export const OPERATION_TYPES = Object.values(OperationType);
