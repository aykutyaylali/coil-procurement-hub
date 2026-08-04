import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";
import { encodeCode128B, code128Bars } from "@/lib/barcode";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "DejaVuSans.ttf");
const FONT_BOLD = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");
const LOGO_PATH = path.join(process.cwd(), "public", "brand", "coil-logo.png");

const BRAND = "#2563eb";
const DARK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#cbd5e1";

export interface LabelSpec {
  locale: Locale;
  companyName: string;
  title: string; // "İŞ EMRİ BARKODU" / "WORK ORDER LABEL"
  number: string;
  barcodeValue: string; // taranacak değer (genelde iş emri no)
  rows: { label: string; value: string }[];
  footer?: string;
}

/** Ortalanmış bir Code128-B barkodu çizer (insan-okunur metniyle). */
function drawBarcode(doc: PDFKit.PDFDocument, value: string, cx: number, top: number, targetWidth: number, height: number) {
  const { totalModules } = encodeCode128B(value);
  const moduleWidth = targetWidth / totalModules;
  const { bars, width } = code128Bars(value, moduleWidth, 0);
  const startX = cx - width / 2;
  doc.fillColor("#000000");
  for (const b of bars) doc.rect(startX + b.x, top, b.width, height).fill("#000000");
  doc.font("body").fontSize(11).fillColor(DARK).text(value, cx - targetWidth / 2, top + height + 4, { width: targetWidth, align: "center" });
}

/** İş Emri barkod etiketi PDF'i (yazdırılabilir). */
export function renderLabelPdf(spec: LabelSpec): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  doc.registerFont("body", FONT_REGULAR);
  doc.registerFont("bold", FONT_BOLD);
  doc.font("body");

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const contentWidth = pageRight - pageLeft;
  const cardTop = 60;
  const cardHeight = 360;

  // Etiket kartı çerçevesi
  doc.roundedRect(pageLeft, cardTop, contentWidth, cardHeight, 8).lineWidth(1).strokeColor(BORDER).stroke();

  // Başlık şeridi
  doc.rect(pageLeft, cardTop, contentWidth, 54).fill("#f8fafc");
  try {
    doc.image(LOGO_PATH, pageLeft + 14, cardTop + 12, { fit: [120, 30] });
  } catch {
    doc.rect(pageLeft + 14, cardTop + 10, 34, 34).fill(BRAND);
    doc.fillColor("#ffffff").font("bold").fontSize(18).text("C", pageLeft + 24, cardTop + 17);
  }
  doc.font("bold").fontSize(13).fillColor(BRAND).text(spec.title, pageRight - 260, cardTop + 14, { width: 246, align: "right" });
  doc.font("body").fontSize(9).fillColor(MUTED).text(spec.companyName, pageRight - 260, cardTop + 32, { width: 246, align: "right" });

  // Büyük iş emri numarası
  let y = cardTop + 74;
  doc.font("bold").fontSize(30).fillColor(DARK).text(spec.number, pageLeft, y, { width: contentWidth, align: "center" });

  // Barkod
  y += 46;
  drawBarcode(doc, spec.barcodeValue, pageLeft + contentWidth / 2, y, Math.min(360, contentWidth - 40), 70);

  // Bilgi satırları (2 sütun)
  y += 70 + 34;
  const colW = (contentWidth - 24) / 2;
  let col = 0;
  let rowY = y;
  for (const r of spec.rows) {
    const x = pageLeft + col * (colW + 24);
    doc.font("body").fontSize(8).fillColor(MUTED).text(r.label, x, rowY, { width: colW });
    doc.font("bold").fontSize(11).fillColor(DARK).text(r.value || "-", x, rowY + 11, { width: colW });
    col = col === 0 ? 1 : 0;
    if (col === 0) rowY += 34;
  }

  // Alt bilgi
  const fy = cardTop + cardHeight - 22;
  doc.font("body").fontSize(7.5).fillColor(MUTED).text(
    `${spec.footer ?? spec.companyName}  ·  ${formatDate(new Date(), undefined, "dd.MM.yyyy HH:mm")}`,
    pageLeft + 14, fy, { width: contentWidth - 28 },
  );

  doc.end();
  return done;
}
