"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { nextNumber } from "@/domain/numbering";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result, NotFoundError } from "@/lib/errors";

const OPERATION_TYPES = ["DOMESTIC_PURCHASE", "IMPORT_PURCHASE", "EXPORT_RELATED_PURCHASE"] as const;

const baseSchema = z.object({
  legalName: z.string().min(1, "Ünvan zorunlu."),
  shortName: z.string().optional(),
  supplierType: z.enum(["DOMESTIC", "FOREIGN"]).default("DOMESTIC"),
  taxIdType: z.string().optional(),
  taxOffice: z.string().optional(),
  taxNumber: z.string().optional(),
  country: z.string().default("TR"),
  addressLine: z.string().optional(),
  city: z.string().optional(),
  stateRegion: z.string().optional(),
  postalCode: z.string().optional(),
  website: z.string().optional(),
  preferredLanguage: z.enum(["tr", "en"]).default("tr"),
  defaultCurrency: z.string().default("TRY"),
  defaultIncoterm: z.string().optional(),
  defaultPaymentTermDays: z.coerce.number().int().nonnegative().optional(),
  operationTypes: z.array(z.enum(OPERATION_TYPES)).default([]),
  isManufacturer: z.boolean().default(false),
  isDistributor: z.boolean().default(false),
  isExporter: z.boolean().default(false),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  // Birincil iletişim (opsiyonel)
  contactName: z.string().optional(),
  contactEmail: z.string().email("Geçerli e-posta girin.").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
});

export async function createSupplier(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIER_CREATE);
    const data = baseSchema.parse(input);

    const created = await prisma.$transaction(async (tx) => {
      const code = await nextNumber(tx, user.tenantId, "SUPPLIER");
      const supplier = await tx.supplier.create({
        data: {
          tenantId: user.tenantId,
          code,
          legalName: data.legalName,
          shortName: data.shortName || null,
          supplierType: data.supplierType,
          taxIdType: data.taxIdType || null,
          taxOffice: data.taxOffice || null,
          taxNumber: data.taxNumber || null,
          country: data.country,
          addressLine: data.addressLine || null,
          city: data.city || null,
          stateRegion: data.stateRegion || null,
          postalCode: data.postalCode || null,
          website: data.website || null,
          preferredLanguage: data.preferredLanguage,
          defaultCurrency: data.defaultCurrency,
          defaultIncoterm: data.defaultIncoterm || null,
          defaultPaymentTermDays: data.defaultPaymentTermDays ?? null,
          operationTypes: JSON.stringify(data.operationTypes),
          isManufacturer: data.isManufacturer,
          isDistributor: data.isDistributor,
          isExporter: data.isExporter,
          riskLevel: data.riskLevel,
          status: "DRAFT",
          contacts:
            data.contactName && data.contactName.trim()
              ? { create: [{ name: data.contactName, email: data.contactEmail || null, phone: data.contactPhone || null, isPrimary: true }] }
              : undefined,
        },
      });
      await writeAudit(
        { tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "Supplier", entityId: supplier.id, after: { code, legalName: data.legalName, status: "DRAFT" } },
        tx,
      );
      return supplier;
    });
    revalidatePath("/suppliers");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

export async function updateSupplier(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
    const data = baseSchema.extend({ id: z.string() }).parse(input);
    const existing = await prisma.supplier.findFirst({ where: { id: data.id, tenantId: user.tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundError("Tedarikçi bulunamadı.");

    await prisma.supplier.update({
      where: { id: existing.id },
      data: {
        legalName: data.legalName,
        shortName: data.shortName || null,
        supplierType: data.supplierType,
        taxIdType: data.taxIdType || null,
        taxOffice: data.taxOffice || null,
        taxNumber: data.taxNumber || null,
        country: data.country,
        addressLine: data.addressLine || null,
        city: data.city || null,
        stateRegion: data.stateRegion || null,
        postalCode: data.postalCode || null,
        website: data.website || null,
        preferredLanguage: data.preferredLanguage,
        defaultCurrency: data.defaultCurrency,
        defaultIncoterm: data.defaultIncoterm || null,
        defaultPaymentTermDays: data.defaultPaymentTermDays ?? null,
        operationTypes: JSON.stringify(data.operationTypes),
        isManufacturer: data.isManufacturer,
        isDistributor: data.isDistributor,
        isExporter: data.isExporter,
        riskLevel: data.riskLevel,
      },
    });
    await writeAudit({
      tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "Supplier", entityId: existing.id,
      before: { legalName: existing.legalName, riskLevel: existing.riskLevel, supplierType: existing.supplierType },
      after: { legalName: data.legalName, riskLevel: data.riskLevel, supplierType: data.supplierType },
    });
    revalidatePath(`/suppliers/${existing.id}`);
    return ok({ id: existing.id });
  } catch (e) {
    return fail(e);
  }
}

/** Tedarikçi statü değişimi (DRAFT→ONBOARDING→ACTIVE / BLACKLISTED / INACTIVE). */
export async function setSupplierStatus(input: { id: string; status: string; reason?: string }): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIER_APPROVE);
    const s = await prisma.supplier.findFirst({ where: { id: input.id, tenantId: user.tenantId, deletedAt: null } });
    if (!s) throw new NotFoundError("Tedarikçi bulunamadı.");
    const blacklist = input.status === "BLACKLISTED";
    await prisma.supplier.update({
      where: { id: s.id },
      data: { status: input.status, isBlacklisted: blacklist, blacklistReason: blacklist ? input.reason || null : null },
    });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "Supplier", entityId: s.id, before: { status: s.status }, after: { status: input.status } });
    revalidatePath(`/suppliers/${s.id}`);
    return ok({ status: input.status });
  } catch (e) {
    return fail(e);
  }
}
