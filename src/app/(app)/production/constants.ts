// Üretim Saha Yönetimi (MES) — saf sabitler. Client + server + test paylaşır.
// (Sunucu bileşenleri bu sabitleri ASLA bir "use client" dosyası üzerinden almamalı;
//  aksi halde client-reference stub'a döner ve SSR çöker — Satış modülündeki ders.)

export const WORK_ORDER_STATUS = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUS)[number];

export const WO_STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planlandı",
  IN_PROGRESS: "Üretimde",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

export const LOG_STATUS = ["ACTIVE", "PAUSED", "DONE"] as const;
export type LogStatus = (typeof LOG_STATUS)[number];

// Canlı durum rozetleri (dashboard operatör zaman akışı)
export const LOG_STATUS_BADGE: Record<string, { label: string; dot: string }> = {
  ACTIVE: { label: "Çalışıyor", dot: "🟢" },
  PAUSED: { label: "Molada", dot: "🟡" },
  DONE: { label: "Durdu", dot: "🔴" },
};

// Üretim hatları
export const PRODUCTION_LINES = ["LINE-2", "LINE-3", "LINE-4", "LINE-5"] as const;

// Bobin tipleri (Satış modülüyle uyumlu)
export const COIL_TYPES = ["STATOR_COIL", "ROTOR_COIL", "POLE", "OTHER"] as const;

/**
 * Varsayılan üretim istasyonları / akış adımları (bobin üretim rotası).
 * İlk kurulumda / demo seed'de oluşturulur; sequence akış sırasını verir.
 */
export const DEFAULT_STATIONS: { code: string; name: string; sequence: number; defaultMinutes: number }[] = [
  { code: "LO", name: "Loading / Sarım Hazırlık", sequence: 1, defaultMinutes: 30 },
  { code: "PRO", name: "Profilleme (Profiling)", sequence: 2, defaultMinutes: 45 },
  { code: "SPR", name: "Spreading / Yayma", sequence: 3, defaultMinutes: 40 },
  { code: "CNS", name: "Consolidation / Presleme", sequence: 4, defaultMinutes: 35 },
  { code: "NOMEX", name: "Nomex İzolasyon", sequence: 5, defaultMinutes: 50 },
  { code: "THO", name: "Termal İşlem (Thermal)", sequence: 6, defaultMinutes: 60 },
  { code: "TEST", name: "Ara Test", sequence: 7, defaultMinutes: 25 },
  { code: "SURGE", name: "Surge Test", sequence: 8, defaultMinutes: 20 },
  { code: "HV", name: "Yüksek Gerilim (HV) Test", sequence: 9, defaultMinutes: 25 },
  { code: "PACKAGE", name: "Paketleme (Package)", sequence: 10, defaultMinutes: 30 },
];

/** İlerleme panosunda öne çıkarılan kilometre taşı istasyonları. */
export const MILESTONE_STATIONS = ["LO", "PRO", "SPR", "TEST"] as const;
