import { describe, it, expect } from "vitest";
import { suggestCategoryLocal, tokenize } from "@/domain/ai/category-suggest";

const cats = [
  { id: "c1", name: "Bakır / İletken (Tel & Bara)" },
  { id: "c2", name: "Mika / İzolasyon" },
  { id: "c3", name: "Hırdavat" },
];
const samples = [
  { categoryId: "c1", description: "Emaye bakır tel 2.5mm" },
  { categoryId: "c1", description: "Bakır bara 40x5" },
  { categoryId: "c2", description: "Mika bant izolasyon" },
  { categoryId: "c2", description: "Nomex izolasyon kağıdı" },
  { categoryId: "c3", description: "Civata somun M8" },
];

describe("yerel kategori önerisi (ücretsiz)", () => {
  it("tokenize stopword ve kısa kelimeleri eler", () => {
    expect(tokenize("Bakır tel 2 mm ve")).toContain("bakır");
    expect(tokenize("Bakır tel 2 mm ve")).not.toContain("ve");
    expect(tokenize("Bakır tel 2 mm ve")).not.toContain("mm");
  });

  it("geçmiş kalemlerden en uygun kategoriyi önerir", () => {
    const s = suggestCategoryLocal("Emaye bakır tel 1.8mm", samples, cats);
    expect(s?.categoryId).toBe("c1");
    expect(s?.source).toBe("local");
  });

  it("kategori adı kelimesiyle de eşleşir", () => {
    const s = suggestCategoryLocal("izolasyon malzemesi", samples, cats);
    expect(s?.categoryId).toBe("c2");
  });

  it("hiç örtüşme yoksa null döner", () => {
    expect(suggestCategoryLocal("xyzqwerty", samples, cats)).toBeNull();
  });

  it("çok kısa açıklamada null", () => {
    expect(suggestCategoryLocal("ab", samples, cats)).toBeNull();
  });
});
