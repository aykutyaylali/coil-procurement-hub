import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCurrentUser, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { reportDetailCsv, type ReportFilters } from "@/domain/reports";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !userCan(user, PERMISSIONS.REPORT_VIEW)) return new NextResponse("Yetkisiz", { status: 401 });
  const s = req.nextUrl.searchParams;
  const f: ReportFilters = {
    dateFrom: s.get("dateFrom") ?? undefined, dateTo: s.get("dateTo") ?? undefined,
    categoryId: s.get("categoryId") ?? undefined, supplierId: s.get("supplierId") ?? undefined,
    operationType: s.get("operationType") ?? undefined, currency: s.get("currency") ?? undefined,
    status: s.get("status") ?? undefined,
  };
  const csv = await reportDetailCsv(user.tenantId, f);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="harcama-raporu.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
