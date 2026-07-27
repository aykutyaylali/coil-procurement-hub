import { NextRequest, NextResponse } from "next/server";

/**
 * Güvenlik başlıkları + basit hız sınırlama (in-memory).
 * Not: Üretimde çok örnekli dağıtımda Redis tabanlı rate limit önerilir.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  b.count += 1;
  return b.count <= MAX_REQUESTS;
}

export function middleware(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  // API ve giriş için hız sınırı
  if (req.nextUrl.pathname.startsWith("/api") || req.nextUrl.pathname === "/login") {
    if (!rateLimit(`${ip}:${req.nextUrl.pathname}`)) {
      return new NextResponse("Çok fazla istek. Lütfen biraz bekleyin.", { status: 429 });
    }
  }

  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
