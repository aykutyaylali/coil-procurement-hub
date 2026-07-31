"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/context";
import { ok, fail, type Result } from "@/lib/errors";
import { suggestCategoryLocal, type CategorySuggestion } from "@/domain/ai/category-suggest";
import { aiMode } from "@/lib/ai";

/**
 * Kalem açıklamasına göre kategori önerir. Varsayılan: YEREL, ÜCRETSİZ heuristik
 * (geçmiş talep kalemlerinden öğrenir). AI_PROVIDER=anthropic + anahtar tanımlıysa
 * ileride Claude'a yönlendirilebilir; anahtar yoksa local kullanılır.
 */
export async function suggestCategory(description: string): Promise<Result<(CategorySuggestion & { mode: string }) | null>> {
  try {
    const user = await requireUser();
    if (!description || description.trim().length < 3) return ok(null);

    const [categories, samples] = await Promise.all([
      prisma.category.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true } }),
      prisma.requisitionLine.findMany({
        where: { requisition: { tenantId: user.tenantId }, categoryId: { not: null } },
        select: { categoryId: true, description: true },
        take: 2000,
        orderBy: { requisition: { createdAt: "desc" } },
      }),
    ]);

    const validSamples = samples
      .filter((s): s is { categoryId: string; description: string } => !!s.categoryId)
      .map((s) => ({ categoryId: s.categoryId, description: s.description }));

    // aiMode() ileride "anthropic" olabilir; şu an her koşulda ücretsiz local kullanılır.
    const suggestion = suggestCategoryLocal(description, validSamples, categories);
    if (!suggestion) return ok(null);
    return ok({ ...suggestion, mode: aiMode() });
  } catch (e) {
    return fail(e);
  }
}
