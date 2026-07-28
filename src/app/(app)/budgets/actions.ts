"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { toStr } from "@/lib/money";
import { ok, fail, type Result, NotFoundError } from "@/lib/errors";

const schema = z.object({
  companyId: z.string().min(1, "Şirket seçin."),
  costCenterId: z.string().optional(),
  projectId: z.string().optional(),
  categoryId: z.string().optional(),
  fiscalYear: z.coerce.number().min(2000).max(2100),
  period: z.enum(["YEAR", "MONTH"]).default("YEAR"),
  currency: z.string().default("TRY"),
  plannedAmount: z.string().default("0"),
});

export async function createBudget(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.BUDGET_MANAGE);
    const data = schema.parse(input);
    const b = await prisma.budget.create({
      data: {
        tenantId: user.tenantId, companyId: data.companyId,
        costCenterId: data.costCenterId || null, projectId: data.projectId || null,
        categoryId: data.categoryId || null, fiscalYear: data.fiscalYear, period: data.period,
        currency: data.currency, plannedAmount: toStr(data.plannedAmount, 2),
      },
    });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "Budget", entityId: b.id, after: { fiscalYear: data.fiscalYear, planned: data.plannedAmount } });
    revalidatePath("/budgets");
    return ok({ id: b.id });
  } catch (e) {
    return fail(e);
  }
}

export async function updateBudget(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.BUDGET_MANAGE);
    const data = schema.extend({ id: z.string() }).parse(input);
    const existing = await prisma.budget.findFirst({ where: { id: data.id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundError("Bütçe bulunamadı.");
    await prisma.budget.update({
      where: { id: existing.id },
      data: {
        companyId: data.companyId, costCenterId: data.costCenterId || null, projectId: data.projectId || null,
        categoryId: data.categoryId || null, fiscalYear: data.fiscalYear, period: data.period,
        currency: data.currency, plannedAmount: toStr(data.plannedAmount, 2),
      },
    });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "Budget", entityId: existing.id, before: { planned: existing.plannedAmount }, after: { planned: data.plannedAmount } });
    revalidatePath(`/budgets/${existing.id}`);
    return ok({ id: existing.id });
  } catch (e) {
    return fail(e);
  }
}

/** Manuel bütçe hareketi (düzeltme). */
export async function addBudgetTransaction(input: { budgetId: string; type: "RESERVE" | "RELEASE" | "COMMIT" | "INVOICE" | "PAYMENT"; amount: string; note?: string }): Promise<Result<null>> {
  try {
    const user = await requirePermission(PERMISSIONS.BUDGET_MANAGE);
    const b = await prisma.budget.findFirst({ where: { id: input.budgetId, tenantId: user.tenantId } });
    if (!b) throw new NotFoundError("Bütçe bulunamadı.");
    await prisma.budgetTransaction.create({ data: { budgetId: b.id, type: input.type, amount: toStr(input.amount || "0", 2), note: input.note || "Manuel düzeltme" } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "Budget", entityId: b.id, after: { transaction: input.type, amount: input.amount } });
    revalidatePath(`/budgets/${b.id}`);
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}
