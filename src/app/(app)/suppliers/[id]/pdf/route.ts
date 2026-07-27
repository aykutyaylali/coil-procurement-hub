import type { NextRequest } from "next/server";
import { pdfAuth, pdfResponse, pdfError } from "@/lib/pdf/http";
import { buildSupplierEvalPdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await pdfAuth(req.nextUrl.searchParams);
  if (!auth) return pdfError("Yetkisiz", 401);
  try {
    return pdfResponse(await buildSupplierEvalPdf(id, auth.tenantId, auth.locale), `Tedarikci-${id}.pdf`);
  } catch (e) {
    return pdfError(e instanceof Error ? e.message : "Hata", 404);
  }
}
