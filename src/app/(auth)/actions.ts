"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { verifyTotp } from "@/lib/auth/totp";
import { createSession, destroySession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { headers } from "next/headers";

const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin."),
  password: z.string().min(1, "Parola gerekli."),
  token: z.string().optional(),
});

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type LoginState = { error?: string; mfaRequired?: boolean; email?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    token: formData.get("token") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz giriş." };
  }
  const { email, password, token } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase() },
  });

  // Zamanlama saldırılarına karşı sabit mesaj
  const invalid: LoginState = { error: "E-posta veya parola hatalı." };

  if (!user || !user.passwordHash || !user.isActive) return invalid;

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { error: "Hesap geçici olarak kilitli. Lütfen daha sonra tekrar deneyin." };
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil:
          failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return invalid;
  }

  // MFA
  if (user.mfaEnabled && user.mfaSecret) {
    if (!token) return { mfaRequired: true, email };
    if (!verifyTotp(user.mfaSecret, token)) {
      return { error: "Doğrulama kodu hatalı.", mfaRequired: true, email };
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await createSession(user.id);

  const hdrs = await headers();
  await writeAudit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
