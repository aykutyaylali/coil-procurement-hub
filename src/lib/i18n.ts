/**
 * i18n mimarisi (baştan tasarlanmış, yüzeysel çeviri değil).
 * - Merkezi sözlükler (tr/en). Aynı anahtar kümesine sahip olmaları test edilir.
 * - t(key, locale, params) ile çeviri; {param} yer tutucu desteği.
 * - Yerele/ülkeye duyarlı sayı, para, tarih biçimlendirme.
 * - Türkçe karakter uyumlu sıralama (Intl.Collator "tr").
 * Yeni dil eklemek: LOCALES'e kod ekleyin ve dictionaries'e sözlük ekleyin.
 */
import { tr } from "@/lib/i18n/tr";
import { en } from "@/lib/i18n/en";

export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "tr";

export type TranslationKey = keyof typeof tr;
/**
 * Çağrılabilir çeviri anahtarı tipi: bilinen anahtarlar (otomatik tamamlama korunur)
 * + dinamik olarak üretilen anahtarlar (ör. `prodWo.woStatus.${status}`). Bulunamayan
 * anahtar çalışma zamanında anahtarın kendisine geri düşer (güvenli).
 */
export type TKey = TranslationKey | (string & {});
export type Dictionary = Record<TranslationKey, string>;

const dictionaries: Record<Locale, Dictionary> = { tr, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Çeviri. Anahtar bulunamazsa Türkçe fallback, o da yoksa anahtarın kendisi döner.
 * params ile {isim} tarzı yer tutucular değiştirilir.
 */
export function t(
  key: TKey,
  locale: Locale = DEFAULT_LOCALE,
  params?: Record<string, string | number>,
): string {
  const dict = getDictionary(locale) as Record<string, string>;
  let text: string = dict[key] ?? (tr as Record<string, string>)[key] ?? (key as string);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

/** Bir locale için t fonksiyonu üreticisi (kısayol). */
export function translator(locale: Locale) {
  return (key: TKey, params?: Record<string, string | number>) => t(key, locale, params);
}

// --- Yerele duyarlı biçimlendirme ---
const localeTag: Record<Locale, string> = { tr: "tr-TR", en: "en-US" };

export function formatNumber(value: number, locale: Locale = DEFAULT_LOCALE, decimals = 2): string {
  return new Intl.NumberFormat(localeTag[locale], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCurrency(
  value: number,
  currency = "TRY",
  locale: Locale = DEFAULT_LOCALE,
): string {
  try {
    return new Intl.NumberFormat(localeTag[locale], {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${formatNumber(value, locale)} ${currency}`;
  }
}

// Türkçe karakterlerde doğru sıralama için collator
const collators: Record<Locale, Intl.Collator> = {
  tr: new Intl.Collator("tr", { sensitivity: "base", numeric: true }),
  en: new Intl.Collator("en", { sensitivity: "base", numeric: true }),
};

export function localeCompare(a: string, b: string, locale: Locale = DEFAULT_LOCALE): number {
  return collators[locale].compare(a, b);
}

/** Türkçe/İngilizce uyumlu, aksan/büyük-küçük duyarsız arama eşleşmesi. */
export function localeIncludes(haystack: string, needle: string, locale: Locale = DEFAULT_LOCALE): boolean {
  if (!needle) return true;
  const norm = (s: string) =>
    s.toLocaleLowerCase(locale).normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return norm(haystack).includes(norm(needle));
}
