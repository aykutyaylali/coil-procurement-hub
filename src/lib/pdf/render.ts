import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Locale } from "@/lib/i18n";
import { formatCurrency, formatNumber } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "DejaVuSans.ttf");
const FONT_BOLD = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");
const LOGO_PATH = path.join(process.cwd(), "public", "brand", "coil-logo.png");

const BRAND = "#2563eb";
const DARK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

export interface PdfColumn {
  header: string;
  key: string;
  width: number; // oransal ağırlık
  align?: "left" | "right" | "center";
  money?: boolean;
}

export interface PdfSpec {
  locale: Locale;
  docTypeLabel: string; // "SATINALMA SİPARİŞİ" / "PURCHASE ORDER"
  number: string;
  revision?: number;
  currency: string;
  company: { name: string; taxOffice?: string | null; taxNumber?: string | null; address?: string | null };
  party: { label: string; name: string; meta?: string[] };
  metaRows: { label: string; value: string }[];
  columns: PdfColumn[];
  rows: Record<string, string | number | null>[];
  totals?: { label: string; value: string; bold?: boolean }[];
  terms?: string[];
  footerNote?: string;
}

const T = {
  tr: { page: "Sayfa", of: "/", generated: "Oluşturulma", currency: "Para Birimi" },
  en: { page: "Page", of: "/", generated: "Generated", currency: "Currency" },
};

export function renderPdf(spec: PdfSpec): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  doc.registerFont("body", FONT_REGULAR);
  doc.registerFont("bold", FONT_BOLD);
  doc.font("body");

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const L = spec.locale === "en" ? T.en : T.tr;
  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const contentWidth = pageRight - pageLeft;

  // --- Başlık / marka ---
  doc.rect(pageLeft, 40, contentWidth, 60).fill("#f8fafc");
  // Gerçek şirket logosu (yüklenemezse "C" monogramına düşer — PDF asla bozulmaz)
  let nameX = pageLeft + 60;
  try {
    doc.image(LOGO_PATH, pageLeft + 12, 54, { fit: [110, 34] });
    nameX = pageLeft + 132;
  } catch {
    doc.rect(pageLeft + 12, 52, 36, 36).fill(BRAND);
    doc.fillColor("#ffffff").font("bold").fontSize(20).text("C", pageLeft + 22, 60);
  }
  doc.fillColor(DARK).font("bold").fontSize(14).text(spec.company.name, nameX, 54, { width: pageRight - nameX - 230 });
  doc.font("body").fontSize(8).fillColor(MUTED);
  const compMeta = [
    spec.company.taxOffice && spec.company.taxNumber ? `VD: ${spec.company.taxOffice} / VKN: ${spec.company.taxNumber}` : null,
    spec.company.address,
  ].filter(Boolean).join("  ·  ");
  if (compMeta) doc.text(compMeta, nameX, 76, { width: pageRight - nameX - 230 });

  // Belge türü + numara (sağ üst)
  doc.font("bold").fontSize(13).fillColor(BRAND).text(spec.docTypeLabel, pageRight - 220, 52, { width: 208, align: "right" });
  doc.font("body").fontSize(10).fillColor(DARK).text(`${spec.number}${spec.revision ? ` (Rev ${spec.revision})` : ""}`, pageRight - 220, 70, { width: 208, align: "right" });

  let y = 118;

  // --- Meta blokları ---
  doc.font("bold").fontSize(9).fillColor(DARK).text(spec.party.label, pageLeft, y);
  doc.font("body").fontSize(9).fillColor(DARK).text(spec.party.name, pageLeft, y + 12, { width: contentWidth / 2 - 10 });
  let py = y + 24;
  for (const m of spec.party.meta ?? []) { doc.fillColor(MUTED).fontSize(8).text(m, pageLeft, py, { width: contentWidth / 2 - 10 }); py += 11; }

  let my = y;
  const metaX = pageLeft + contentWidth / 2 + 10;
  for (const row of spec.metaRows) {
    doc.font("body").fontSize(8).fillColor(MUTED).text(row.label, metaX, my, { width: 90 });
    doc.font("bold").fontSize(8).fillColor(DARK).text(row.value, metaX + 95, my, { width: contentWidth / 2 - 105, align: "right" });
    my += 13;
  }
  y = Math.max(py, my) + 14;

  // --- Tablo başlığı ---
  const totalW = spec.columns.reduce((s, c) => s + c.width, 0);
  const colX: number[] = [];
  let cx = pageLeft;
  for (const c of spec.columns) { colX.push(cx); cx += (c.width / totalW) * contentWidth; }
  const colW = (i: number) => (spec.columns[i]!.width / totalW) * contentWidth;

  function tableHeader() {
    doc.rect(pageLeft, y, contentWidth, 20).fill(DARK);
    doc.font("bold").fontSize(8).fillColor("#ffffff");
    spec.columns.forEach((c, i) => doc.text(c.header, colX[i]! + 4, y + 6, { width: colW(i) - 8, align: c.align ?? "left" }));
    y += 20;
  }
  tableHeader();

  doc.font("body").fontSize(8).fillColor(DARK);
  for (const row of spec.rows) {
    // Sayfa taşması
    const rowH = 18;
    if (y + rowH > doc.page.height - 90) {
      doc.addPage();
      y = 50;
      tableHeader();
      doc.font("body").fontSize(8).fillColor(DARK);
    }
    spec.columns.forEach((c, i) => {
      let val = row[c.key];
      let text = val == null || val === "" ? "-" : String(val);
      if (c.money && val != null && val !== "") text = formatCurrency(Number(val), spec.currency, spec.locale);
      doc.fillColor(DARK).text(text, colX[i]! + 4, y + 5, { width: colW(i) - 8, align: c.align ?? "left" });
    });
    doc.moveTo(pageLeft, y + rowH).lineTo(pageRight, y + rowH).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += rowH;
  }

  // --- Toplamlar ---
  if (spec.totals?.length) {
    y += 8;
    const boxX = pageRight - 220;
    for (const t of spec.totals) {
      doc.font(t.bold ? "bold" : "body").fontSize(t.bold ? 10 : 9).fillColor(t.bold ? DARK : MUTED);
      doc.text(t.label, boxX, y, { width: 110 });
      doc.fillColor(DARK).text(t.value, boxX + 110, y, { width: 110, align: "right" });
      y += t.bold ? 16 : 13;
    }
  }

  // --- Şartlar ---
  if (spec.terms?.length) {
    y += 14;
    doc.font("bold").fontSize(8).fillColor(DARK).text(spec.locale === "en" ? "Terms & Conditions" : "Ticari Koşullar", pageLeft, y);
    y += 12;
    doc.font("body").fontSize(7.5).fillColor(MUTED);
    for (const t of spec.terms) { doc.text("• " + t, pageLeft, y, { width: contentWidth }); y += 11; }
  }

  // --- Alt bilgi + sayfa numarası ---
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const fy = doc.page.height - 40;
    doc.font("body").fontSize(7).fillColor(MUTED);
    doc.text(`${spec.footerNote ?? spec.company.name}  ·  ${L.generated}: ${formatDate(new Date(), undefined, "dd.MM.yyyy HH:mm")}`, pageLeft, fy, { width: contentWidth - 80 });
    doc.text(`${L.page} ${i + 1} ${L.of} ${range.count}`, pageRight - 80, fy, { width: 80, align: "right" });
  }

  doc.end();
  return done;
}

export { formatCurrency, formatNumber };
