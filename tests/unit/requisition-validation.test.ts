import { describe, it, expect } from "vitest";
import { draftSchema, meaningfulLines, validateForSubmit } from "@/domain/requisition";

/**
 * Talep taslak/gönderim doğrulama ayrımı — regresyon.
 * (Senaryo 1,3,4,5,6 + mesaj kalitesi)
 */
describe("talep taslak doğrulaması (minimal)", () => {
  it("1) eksik açıklama/kalem ile taslak parse edilebilir (hata vermez)", () => {
    const r = draftSchema.safeParse({ companyId: "c1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.lines).toEqual([]);
  });

  it("1b) tamamen boş kalemler ile taslak geçerli", () => {
    const r = draftSchema.safeParse({ companyId: "c1", lines: [{ description: "", quantity: "" }] });
    expect(r.success).toBe(true);
  });

  it("şirket olmadan taslak dahi geçersiz (teknik zorunlu)", () => {
    const r = draftSchema.safeParse({ lines: [] });
    expect(r.success).toBe(false);
  });

  it("meaningfulLines yalnızca açıklaması dolu kalemleri tutar", () => {
    const kept = meaningfulLines([
      { description: "Kalem A", quantity: "1" },
      { description: "  ", quantity: "5" },
      { description: "", quantity: "0" },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.description).toBe("Kalem A");
  });
});

describe("talep onaya gönderme doğrulaması (tam)", () => {
  it("3) eksik açıklamayla onaya gönderilemez", () => {
    const v = validateForSubmit({ companyId: "c1", lines: [{ description: "", quantity: "5" }] }, "tr");
    expect(v.ok).toBe(false);
    expect(v.firstField).toBeTruthy();
  });

  it("4) hata ilgili alanda kullanıcı dostu Türkçe metindir (ham kod değil)", () => {
    const v = validateForSubmit({ companyId: "c1", lines: [{ description: "", quantity: "5" }] }, "tr");
    const msg = Object.values(v.fields)[0]!;
    expect(msg).toMatch(/açıklama|kalem/i);
    // Ham anahtar/kod/JSON içermez
    expect(msg).not.toMatch(/DESCRIPTION_REQUIRED|required_description|\{|\[|zod/i);
  });

  it("5) İngilizce dilinde İngilizce hata gösterir", () => {
    const v = validateForSubmit({ companyId: "c1", lines: [{ description: "", quantity: "5" }] }, "en");
    const msg = Object.values(v.fields)[0]!;
    expect(msg).toMatch(/description|line/i);
    expect(msg).not.toMatch(/açıklama/i);
  });

  it("hiç kalem yoksa 'en az bir kalem' hatası", () => {
    const v = validateForSubmit({ companyId: "c1", lines: [] }, "tr");
    expect(v.ok).toBe(false);
    expect(v.fields["lines.0.description"]).toMatch(/en az bir/i);
  });

  it("6) açıklama tamamlanınca onaya gönderilebilir", () => {
    const v = validateForSubmit({ companyId: "c1", lines: [{ description: "Rulman", quantity: "10", estUnitPrice: "300" }] }, "tr");
    expect(v.ok).toBe(true);
    expect(Object.keys(v.fields)).toHaveLength(0);
  });

  it("açıklama dolu ama miktar 0 ise miktar hatası", () => {
    const v = validateForSubmit({ companyId: "c1", lines: [{ description: "Rulman", quantity: "0" }] }, "tr");
    expect(v.ok).toBe(false);
    expect(v.fields["lines.0.quantity"]).toMatch(/miktar/i);
  });

  it("şirket boşsa companyId hatası (iki dilli)", () => {
    expect(validateForSubmit({ companyId: "", lines: [{ description: "X", quantity: "1" }] }, "tr").fields["companyId"]).toMatch(/şirket/i);
    expect(validateForSubmit({ companyId: "", lines: [{ description: "X", quantity: "1" }] }, "en").fields["companyId"]).toMatch(/company/i);
  });
});
