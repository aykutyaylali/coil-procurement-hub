import type { NextRequest } from "next/server";
import { pdfAuth, pdfResponse, pdfError } from "@/lib/pdf/http";
import { buildSpendReportPdf } from "@/lib/pdf/reports-pdf";
import type { ReportFilters } from "@/domain/reports";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await pdfAuth(req.nextUrl.searchParams);
  if (!auth) return pdfError("Yetkisiz", 401);
  const s = req.nextUrl.searchParams;
  const f: ReportFilters = {
    dateFrom: s.get("dateFrom") ?? undefined, dateTo: s.get("dateTo") ?? undefined,
    categoryId: s.get("categoryId") ?? undefined, supplierId: s.get("supplierId") ?? undefined,
    operationType: s.get("operationType") ?? undefined, currency: s.get("currency") ?? undefined,
    status: s.get("status") ?? undefined,
  };
  try {
    return pdfResponse(await buildSpendReportPdf(auth.tenantId, auth.locale, f), "harcama-raporu.pdf");
  } catch (e) {
    return pdfError(e instanceof Error ? e.message : "Hata", 500);
  }
}
