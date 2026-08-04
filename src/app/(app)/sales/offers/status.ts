// Sales Offer durum modeli — saf sabitler (client + server + test paylaşır).
export const OFFER_STATUS = ["OPEN", "ORDER", "CLOSED", "REJECTED"] as const;
export type OfferStatus = (typeof OFFER_STATUS)[number];

export const OFFER_STATUS_LABEL: Record<string, string> = {
  OPEN: "Açık",
  ORDER: "Siparişe Dönüştü",
  CLOSED: "Kapandı",
  REJECTED: "Reddedildi",
};

// Özet kartlarında gösterilecek para birimleri
export const OFFER_CURRENCIES = ["EUR", "USD", "TRY"] as const;

/** Revizyon numarasını "Rev A / Rev B / ..." etiketine çevirir (0 → A). */
export function revisionLabel(revisionNo: number): string {
  if (revisionNo < 0) return "—";
  if (revisionNo < 26) return `Rev ${String.fromCharCode(65 + revisionNo)}`;
  return `Rev ${revisionNo + 1}`;
}
