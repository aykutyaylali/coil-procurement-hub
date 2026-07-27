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
  | { ok: false; error: string; code?: string; fields?: Record<string, string> };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(error: unknown): Result<never> {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: error.message,
      code: error.code,
      fields: error instanceof ValidationError ? error.fields : undefined,
    };
  }
  const message =
    error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
  // Üretimde iç hata detayını sızdırma
  return {
    ok: false,
    error:
      process.env.NODE_ENV === "production"
        ? "İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin."
        : message,
    code: "INTERNAL",
  };
}
