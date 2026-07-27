import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken, secureToken } from "@/lib/ids";
import { addHours } from "@/lib/dates";

const COOKIE_NAME = "cph_session";

/** Yeni oturum oluşturur, güvenli httpOnly cookie yazar. */
export async function createSession(userId: string): Promise<void> {
  const token = secureToken(32);
  const tokenHash = hashToken(token);
  const maxAge = env.SESSION_MAX_AGE_SECONDS;
  const expiresAt = new Date(Date.now() + maxAge * 1000);

  const hdrs = await headers();
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent") ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

/** Cookie'deki oturumu doğrular; geçerliyse userId döndürür. */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  return session.userId;
}

/** Oturumu sonlandırır (logout). */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session
      .updateMany({
        where: { tokenHash: hashToken(token) },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME, addHours };
