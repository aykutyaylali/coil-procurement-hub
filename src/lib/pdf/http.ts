import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/context";
import { isLocale, type Locale } from "@/lib/i18n";

/** PDF rotaları için kimlik + locale çözümleme. */
export async function pdfAuth(searchParams: URLSearchParams): Promise<{ tenantId: string; locale: Locale } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const langParam = searchParams.get("lang");
  const locale: Locale = isLocale(langParam) ? langParam : isLocale(user.locale) ? user.locale : "tr";
  return { tenantId: user.tenantId, locale };
}

export function pdfResponse(buffer: Buffer, fileName: string): NextResponse {
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function pdfError(message: string, status = 400): NextResponse {
  return new NextResponse(message, { status });
}
