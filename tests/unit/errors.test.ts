import { describe, it, expect } from "vitest";
import { z } from "zod";
import { fail, ok, ValidationError, NotFoundError } from "@/lib/errors";

/**
 * fail() kullanıcıya asla ham hata sızdırmamalı (Senaryo 10).
 */
describe("fail() — kullanıcı dostu hata dönüşümü", () => {
  it("10) ZodError ham JSON DEĞİL, alan bazlı okunur mesaja çevrilir", () => {
    const schema = z.object({ description: z.string().min(1, "Açıklama zorunlu.") });
    const parsed = schema.safeParse({ description: "" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const res = fail(parsed.error);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Genel özet + alan mesajı; ham JSON/kod yok
    expect(res.code).toBe("VALIDATION");
    expect(res.fields?.description).toBe("Açıklama zorunlu.");
    expect(res.error).not.toMatch(/\{|\[|"code"|"path"|ZodError/);
  });

  it("beklenmeyen hata: genel mesaj + referans (ref); stack/exception sızmaz", () => {
    const res = fail(new Error("internal boom at line 42\n  at foo()"));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("INTERNAL");
    expect(res.ref).toBeTruthy();
    expect(res.error).toMatch(/beklenmeyen|Ref:/i);
    expect(res.error).not.toMatch(/boom|at foo|line 42/);
  });

  it("AppError anlaşılır mesajını korur", () => {
    const res = fail(new NotFoundError("Talep bulunamadı."));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("Talep bulunamadı.");
    expect(res.code).toBe("NOT_FOUND");
  });

  it("ValidationError alan haritasını taşır", () => {
    const res = fail(new ValidationError("Eksik alanlar var.", { "lines.0.description": "Açıklama gerekli." }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fields?.["lines.0.description"]).toBe("Açıklama gerekli.");
  });

  it("Prisma benzeri bilinen hata dostça mesaja çevrilir (ham metin değil)", () => {
    const prismaErr = Object.assign(new Error("Unique constraint failed"), { name: "PrismaClientKnownRequestError", code: "P2002" });
    const res = fail(prismaErr);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/zaten mevcut|benzersiz/i);
    expect(res.error).not.toMatch(/Unique constraint failed/);
  });

  it("ok() sarmalayıcısı veriyi taşır", () => {
    expect(ok({ id: "x" })).toEqual({ ok: true, data: { id: "x" } });
  });
});
