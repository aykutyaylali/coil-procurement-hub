// Sales RFQ durum modeli — saf sabitler (client + server + test paylaşır).
export const RFQ_STATUS = ["REQUEST", "IN_PROCESS", "OFFERED", "REJECTED", "CANCELLED"] as const;
export type RfqStatus = (typeof RFQ_STATUS)[number];

export const RFQ_STATUS_LABEL: Record<string, string> = {
  REQUEST: "Talep",
  IN_PROCESS: "İşlemde",
  OFFERED: "Teklif Verildi",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal",
};
