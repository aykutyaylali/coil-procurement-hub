"use client";
import { createContext, useContext, useMemo } from "react";
import {
  DEFAULT_LOCALE,
  getDictionary,
  type Dictionary,
  type Locale,
  type TKey,
} from "@/lib/i18n";

interface I18nContextValue {
  locale: Locale;
  t: (key: TKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  t: (key) => key,
});

/**
 * İstemci bileşenlerinde çeviri sağlar. Kullanıcının locale'i sunucudan aktarılır.
 * Böylece hiçbir metin bileşene hard-coded yazılmaz; t("key") kullanılır.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo<I18nContextValue>(() => {
    const dict = getDictionary(locale) as Record<string, string>;
    return {
      locale,
      t: (key, params) => {
        let text: string = dict[key] ?? (key as string);
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          }
        }
        return text;
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
