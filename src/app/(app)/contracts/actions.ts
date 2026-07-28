"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { nextNumber } from "@/domain/numbering";
import { writeAudit } from "@/lib/audit";
import { toStr } from "@/lib/money";
import { ok, fail, type Result, NotFoundError } from "@/lib/errors";

const itemSchema = z.object({
  description: z.string().min(1, "Açıklama zorunlu."),
  unitPrice: z.string().default("0"),
  uom: z.string().optional(),
});

const baseSchema = z.object({
  supplierId: z.string().min(1, "Tedarikçi seçin."),
  title: z.string().min(1, "Başlık zorunlu."),
  type: z.string().default("FRAMEWORK"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  autoRenew: z.boolean().default(false),
  noticeDate: z.string().optional(),
  currency: z.string().default("TRY"),
  totalLimit: z.string().optional(),
  slaTerms: z.string().optional(),
});

export async function createContract(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.CONTRACT_MANAGE);
    const data = baseSchema.extend({ items: z.array(itemSchema).default([]) }).parse(input);

    const created = await prisma.$transaction(async (tx) => {
      const code = await nextNumber(tx, user.tenantId, "CONTRACT");
      const contract = await tx.contract.create({
        data: {
          tenantId: user.tenantId,
          supplierId: data.supplierId,
          code,
          title: data.title,
          type: data.type,
          status: "DRAFT",
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          autoRenew: data.autoRenew,
          noticeDate: data.noticeDate ? new Date(data.noticeDate) : null,
          currency: data.currency,
          totalLimit: data.totalLimit ? toStr(data.totalLimit, 2) : null,
          slaTerms: data.slaTerms || null,
          items: {
            create: data.items.map((i) => ({
              description: i.description,
              unitPrice: toStr(i.unitPrice, 4),
              currency: data.currency,
              uom: i.uom || null,
            })),
          },
        },
      });
      await writeAudit(
        { tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "Contract", entityId: contract.id, after: { code, title: data.title, status: "DRAFT" } },
        tx,
      );
      return contract;
    });
    revalidatePath("/contracts");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

export async function updateContract(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.CONTRACT_MANAGE);
    const data = baseSchema.extend({ id: z.string() }).parse(input);
    const existing = await prisma.contract.findFirst({ where: { id: data.id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundError("Sözleşme bulunamadı.");

    await prisma.contract.update({
      where: { id: existing.id },
      data: {
        supplierId: data.supplierId,
        title: data.title,
        type: data.type,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        autoRenew: data.autoRenew,
        noticeDate: data.noticeDate ? new Date(data.noticeDate) : null,
        currency: data.currency,
        totalLimit: data.totalLimit ? toStr(data.totalLimit, 2) : null,
        slaTerms: data.slaTerms || null,
      },
    });
    // Sürüm geçmişi: önceki/yeni değer audit'e yazılır
    await writeAudit({
      tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "Contract", entityId: existing.id,
      before: { title: existing.title, totalLimit: existing.totalLimit, endDate: existing.endDate },
      after: { title: data.title, totalLimit: data.totalLimit, endDate: data.endDate },
    });
    revalidatePath(`/contracts/${existing.id}`);
    return ok({ id: existing.id });
  } catch (e) {
    return fail(e);
  }
}

export async function addContractItem(input: { contractId: string; description: string; unitPrice: string; uom?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.CONTRACT_MANAGE);
    const c = await prisma.contract.findFirst({ where: { id: input.contractId, tenantId: user.tenantId } });
    if (!c) throw new NotFoundError("Sözleşme bulunamadı.");
    const item = await prisma.contractItem.create({
      data: { contractId: c.id, description: input.description, unitPrice: toStr(input.unitPrice || "0", 4), currency: c.currency, uom: input.uom || null },
    });
    revalidatePath(`/contracts/${c.id}`);
    return ok({ id: item.id });
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContractItem(id: string): Promise<Result<null>> {
  try {
    const user = await requirePermission(PERMISSIONS.CONTRACT_MANAGE);
    const item = await prisma.contractItem.findFirst({ where: { id, contract: { tenantId: user.tenantId } }, include: { contract: true } });
    if (!item) throw new NotFoundError("Kalem bulunamadı.");
    await prisma.contractItem.delete({ where: { id } });
    revalidatePath(`/contracts/${item.contractId}`);
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}

/** Sözleşme durumu değişimi (DRAFT→ACTIVE→EXPIRED/TERMINATED). */
export async function setContractStatus(input: { id: string; status: "ACTIVE" | "EXPIRED" | "TERMINATED" | "DRAFT" }): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.CONTRACT_MANAGE);
    const c = await prisma.contract.findFirst({ where: { id: input.id, tenantId: user.tenantId } });
    if (!c) throw new NotFoundError("Sözleşme bulunamadı.");
    await prisma.contract.update({ where: { id: c.id }, data: { status: input.status } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "Contract", entityId: c.id, before: { status: c.status }, after: { status: input.status } });
    revalidatePath(`/contracts/${c.id}`);
    return ok({ status: input.status });
  } catch (e) {
    return fail(e);
  }
}
