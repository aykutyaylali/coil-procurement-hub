import { z } from "zod";

/**
 * Talep doğrulaması — TASLAK ile ONAYA GÖNDERME kesin olarak ayrılır.
 *
 * - Taslak (draftSchema): yalnızca güvenli kayıt için gereken teknik alanlar
 *   zorunludur (şirket). Açıklama, kalem, fiyat, tarih vb. eksik olabilir;
 *   eksik alan hata vermez.
 * - Gönderim (validateForSubmit): tam iş doğrulaması yalnızca onaya gönderme
 *   anında çalışır ve kullanıcı-dostu, iki dilli, alan bazlı mesaj döndürür.
 */

export type Locale = "tr" | "en";

const M = {
  descriptionRequired: {
    tr: "Talebi onaya göndermek için açıklama alanını doldurmalısınız.",
    en: "You must enter a description before submitting the requisition for approval.",
  },
  companyRequired: {
    tr: "Şirket seçmelisiniz.",
    en: "You must select a company.",
  },
  atLeastOneLine: {
    tr: "En az bir talep kalemi eklemeli ve açıklamasını girmelisiniz.",
    en: "Add at least one requisition line with a description.",
  },
  quantityPositive: {
    tr: "Miktar 0'dan büyük olmalı.",
    en: "Quantity must be greater than 0.",
  },
  priceInvalid: {
    tr: "Tahmini birim fiyat geçersiz (negatif olamaz).",
    en: "Estimated unit price is invalid (cannot be negative).",
  },
} as const;

function msg(key: keyof typeof M, locale: Locale): string {
  return M[key][locale] ?? M[key].tr;
}

/** Taslak için minimal şema — yalnızca teknik zorunlular. */
export const draftLineSchema = z.object({
  description: z.string().optional().default(""),
  quantity: z.string().optional().default("1"),
  uom: z.string().optional(),
  estUnitPrice: z.string().optional().default("0"),
  taxRate: z.string().optional().default("20"),
  categoryId: z.string().optional(),
  neededBy: z.string().optional(),
});

export const draftSchema = z.object({
  companyId: z.string().min(1),
  siteId: z.string().optional(),
  departmentId: z.string().optional(),
  costCenterId: z.string().optional(),
  projectId: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  purchaseType: z.enum(["GOODS", "SERVICE", "EXPENSE"]).default("GOODS"),
  operationType: z
    .enum(["DOMESTIC_PURCHASE", "IMPORT_PURCHASE", "EXPORT_RELATED_PURCHASE"])
    .default("DOMESTIC_PURCHASE"),
  exportProjectNo: z.string().optional(),
  targetCountry: z.string().optional(),
  currency: z.string().default("TRY"),
  neededBy: z.string().optional(),
  justification: z.string().optional(),
  internalNote: z.string().optional(),
  lines: z.array(draftLineSchema).optional().default([]),
});

export type DraftInput = z.infer<typeof draftSchema>;

/** Taslakta yalnızca içeriği olan (açıklaması dolu) kalemleri sakla; gerisini at. */
export function meaningfulLines<T extends { description?: string | null }>(lines: T[] | undefined): T[] {
  return (lines ?? []).filter((l) => (l.description ?? "").trim().length > 0);
}

export interface SubmitValidationResult {
  ok: boolean;
  /** Alan yolu → kullanıcı-dostu mesaj (örn. "companyId", "lines.0.description") */
  fields: Record<string, string>;
  /** İlk hatalı alanın yolu (odaklama için) */
  firstField?: string;
}

interface LineForValidation {
  description?: string | null;
  quantity?: string | null;
  estUnitPrice?: string | null;
}

/**
 * Onaya gönderme için TAM doğrulama. Hem yeni form gönderiminde hem de kayıtlı
 * bir taslağın gönderiminde çağrılır (server action + domain). Eksik zorunlu
 * alan varsa alan bazlı, iki dilli mesajlar döndürür; kayıt gönderilmez.
 */
export function validateForSubmit(
  input: { companyId?: string | null; lines: LineForValidation[] },
  locale: Locale = "tr",
): SubmitValidationResult {
  const fields: Record<string, string> = {};

  if (!input.companyId || !input.companyId.trim()) {
    fields["companyId"] = msg("companyRequired", locale);
  }

  const lines = input.lines ?? [];
  const contentLines = lines.filter((l) => (l.description ?? "").trim().length > 0);
  if (contentLines.length === 0) {
    // Hiç anlamlı kalem yok → ilk kalemin açıklamasını işaretle
    fields["lines.0.description"] = msg("atLeastOneLine", locale);
  } else {
    lines.forEach((l, i) => {
      const hasDesc = (l.description ?? "").trim().length > 0;
      const hasAny = hasDesc || Number(l.quantity ?? "0") > 0 || Number(l.estUnitPrice ?? "0") > 0;
      // Kısmen doldurulmuş (açıklaması boş ama başka verisi olan) satırlar için açıklama iste
      if (!hasDesc && hasAny) {
        fields[`lines.${i}.description`] = msg("descriptionRequired", locale);
      }
      if (hasDesc) {
        if (!(Number(l.quantity ?? "0") > 0)) {
          fields[`lines.${i}.quantity`] = msg("quantityPositive", locale);
        }
        if (Number(l.estUnitPrice ?? "0") < 0) {
          fields[`lines.${i}.estUnitPrice`] = msg("priceInvalid", locale);
        }
      }
    });
  }

  const keys = Object.keys(fields);
  return { ok: keys.length === 0, fields, firstField: keys[0] };
}
