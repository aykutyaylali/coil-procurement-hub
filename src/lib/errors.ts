/**
 * Uygulama hata tipleri. Kullanıcıya gösterilecek mesajlar anlaşılır Türkçe olur.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "APP_ERROR",
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Bu işlem için giriş yapmanız gerekiyor.") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Bu işlem için yetkiniz bulunmuyor.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Kayıt bulunamadı.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Girdiğiniz bilgilerde hata var.",
    public readonly fields?: Record<string, string>,
  ) {
    super(message, "VALIDATION", 422);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Bu kayıt zaten mevcut veya çakışma var.") {
    super(message, "CONFLICT", 409);
  }
}

export class StateTransitionError extends AppError {
  constructor(message = "Bu durumdan bu işleme geçiş yapılamaz.") {
    super(message, "INVALID_TRANSITION", 409);
  }
}

/** Server action / route sonucu için standart tip */
export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fields?: Record<string, string>; ref?: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

/**
 * Hatayı KULLANICIYA GÖSTERİLEBİLİR bir sonuca çevirir.
 * Kullanıcıya asla ham Zod objesi, JSON, stack trace, Prisma metni veya
 * exception detayı sızmaz. Beklenmeyen hatalar correlation ID (ref) ile
 * sunucu loguna yazılır; kullanıcı yalnızca genel mesaj + referans görür.
 */
export function fail(error: unknown): Result<never> {
  // 1) Zod doğrulama hatası → alan bazlı, okunur mesajlar (ham JSON değil)
  if (isZodLike(error)) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = Array.isArray(issue.path) ? issue.path.join(".") : "";
      if (key && !fields[key]) fields[key] = issue.message || "Bu alan geçersiz.";
    }
    return {
      ok: false,
      error: "Girdiğiniz bilgilerde eksik veya hatalı alanlar var. Lütfen işaretli alanları kontrol edin.",
      code: "VALIDATION",
      fields: Object.keys(fields).length ? fields : undefined,
    };
  }

  // 2) Uygulama hatası (anlaşılır TR mesajı zaten hazır)
  if (error instanceof AppError) {
    return {
      ok: false,
      error: error.message,
      code: error.code,
      fields: error instanceof ValidationError ? error.fields : undefined,
    };
  }

  // 3) Prisma bilinen hataları → kullanıcı dostu karşılık (ham metin değil)
  const prismaMsg = mapPrismaError(error);
  if (prismaMsg) {
    return { ok: false, error: prismaMsg, code: "DB" };
  }

  // 4) Beklenmeyen hata → correlation ID ile logla, genel mesaj döndür
  const ref = safeRef();
  // eslint-disable-next-line no-console
  console.error(`[hata:${ref}]`, error instanceof Error ? `${error.name}: ${error.message}` : error, error instanceof Error ? error.stack : "");
  return {
    ok: false,
    error: `İşlem sırasında beklenmeyen bir hata oluştu. Lütfen tekrar deneyin. (Ref: ${ref})`,
    code: "INTERNAL",
    ref,
  };
}

/** Zod hata nesnesini paket importuna bağımlı olmadan tanır. */
function isZodLike(error: unknown): error is { issues: Array<{ path: unknown[]; message: string }> } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "ZodError" &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

/** Prisma bilinen hata kodlarını okunur mesaja çevirir. */
function mapPrismaError(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: string }).code;
  const name = (error as { name?: string }).name;
  if (!code || !name || !name.startsWith("PrismaClient")) return null;
  switch (code) {
    case "P2002":
      return "Bu kayıt zaten mevcut (benzersizlik çakışması).";
    case "P2003":
      return "İlişkili bir kayıt bulunamadığı için işlem yapılamadı.";
    case "P2025":
      return "İşlem yapılacak kayıt bulunamadı.";
    default:
      return "Veritabanı işlemi tamamlanamadı. Lütfen tekrar deneyin.";
  }
}

function safeRef(): string {
  try {
    // Test/edge ortamlarında crypto yoksa zaman damgasına düş
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  } catch {
    return "XXXXXX";
  }
}
