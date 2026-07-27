import type { NextRequest } from "next/server";
import { pdfAuth, pdfResponse, pdfError } from "@/lib/pdf/http";
import { buildPurchaseOrderPdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await pdfAuth(req.nextUrl.searchParams);
  if (!auth) return pdfError("Yetkisiz", 401);
  try {
    const buf = await buildPurchaseOrderPdf(id, auth.tenantId, auth.locale);
    return pdfResponse(buf, `Siparis-${id}.pdf`);
  } catch (e) {
    return pdfError(e instanceof Error ? e.message : "Hata", 404);
  }
}
