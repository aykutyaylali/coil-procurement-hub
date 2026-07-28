import "server-only";
import type { Locale } from "@/lib/i18n";
import { formatCurrency } from "@/lib/i18n";
import { renderPdf, type PdfSpec } from "@/lib/pdf/render";
import { computeReports, type ReportFilters } from "@/domain/reports";
import { opLabel } from "@/domain/operations";
import { prisma } from "@/lib/db";

const tr = (loc: Locale, t: string, e: string) => (loc === "en" ? e : t);

export async function buildSpendReportPdf(tenantId: string, locale: Locale, f: ReportFilters): Promise<Buffer> {
  const data = await computeReports(tenantId, f);
  const company = await prisma.company.findFirst({ where: { tenantId } });

  const rows = data.byCategory.map((c) => ({
    cat: c.key,
    count: c.count,
    amount: c.value,
  }));

  const spec: PdfSpec = {
    locale,
    docTypeLabel: tr(locale, "HARCAMA RAPORU", "SPEND REPORT"),
    number: new Date().toISOString().slice(0, 10),
    currency: "TRY",
    company: { name: company?.name ?? "Coil Procurement Hub", taxOffice: company?.taxOffice, taxNumber: company?.taxNumber },
    party: { label: tr(locale, "KAPSAM", "SCOPE"), name: tr(locale, "Kategori bazlı harcama analizi", "Spend analysis by category") },
    metaRows: [
      { label: tr(locale, "Toplam Harcama", "Total Spend"), value: formatCurrency(Number(data.totalSpend), "TRY", locale) },
      { label: tr(locale, "Sipariş", "Orders"), value: String(data.orderCount) },
      { label: tr(locale, "Kalem", "Lines"), value: String(data.lineCount) },
      { label: tr(locale, "Tedarikçi", "Suppliers"), value: String(data.supplierCount) },
      ...(f.operationType ? [{ label: tr(locale, "Operasyon", "Operation"), value: opLabel(f.operationType, locale) }] : []),
    ],
    columns: [
      { header: tr(locale, "Kategori", "Category"), key: "cat", width: 55 },
      { header: tr(locale, "Kalem", "Lines"), key: "count", width: 15, align: "right" },
      { header: tr(locale, "Tutar (TL)", "Amount (TRY)"), key: "amount", width: 30, align: "right", money: true },
    ],
    rows,
    totals: [{ label: tr(locale, "Genel Toplam", "Grand Total"), value: formatCurrency(Number(data.totalSpend), "TRY", locale), bold: true }],
    footerNote: tr(locale, "Harcama Analizi", "Spend Analysis"),
  };
  return renderPdf(spec);
}
