"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { nextNumber } from "@/domain/numbering";
import { writeAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { secureToken, hashToken } from "@/lib/ids";
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

/**
 * Tedarikçiye self-servis onboarding bağlantısı üretir (14 gün geçerli, tek
 * kullanımlık). Ham token yalnızca URL'de döner; DB'de hash'i saklanır.
 * Tedarikçi bu linkle şirket/vergi/iletişim/banka bilgilerini kendisi doldurur.
 */
export async function generateOnboardingLink(supplierId: string): Promise<Result<{ url: string; expiresAt: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
    const s = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: user.tenantId, deletedAt: null } });
    if (!s) throw new NotFoundError("Tedarikçi bulunamadı.");
    const raw = secureToken(24);
    const expiresAt = new Date(Date.now() + 14 * 864e5); // 14 gün
    await prisma.supplier.update({
      where: { id: s.id },
      data: {
        onboardingToken: hashToken(raw),
        onboardingTokenExpiresAt: expiresAt,
        status: s.status === "DRAFT" ? "ONBOARDING" : s.status,
      },
    });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "Supplier", entityId: s.id, after: { onboarding: "LINK_GENERATED", expiresAt: expiresAt.toISOString() } });
    revalidatePath(`/suppliers/${s.id}`);
    return ok({ url: `${env.APP_URL}/onboarding/${raw}`, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Tedarikçi PORTAL kullanıcısı daveti (Master §5, Faz 6). Birincil iletişim kişisi
 * için oturumlu bir kullanıcı (SUPPLIER_USER) hazırlar ve KALICI bir parola-belirleme
 * bağlantısı üretir. Bağlantı süresizdir; admin "Pasife Al" diyene kadar (revoke)
 * geçerli kalır. Ham token cari sayfasında tekrar görüntülenebilsin diye kişide saklanır.
 * Yeniden çağrılırsa yeni token üretir (eskisi geçersiz olur) ve pasifse yeniden aktifler.
 */
export async function invitePortalUser(supplierId: string): Promise<Result<{ url: string; email: string }>> {
  try {
    const admin = await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, tenantId: admin.tenantId, deletedAt: null },
      include: { contacts: { where: { isPrimary: true }, take: 1 } },
    });
    if (!supplier) throw new NotFoundError("Tedarikçi bulunamadı.");
    const contact = supplier.contacts[0];
    if (!contact?.email) return fail(new Error("Önce e-postalı birincil iletişim kişisi ekleyin."));
    const email = contact.email.toLowerCase();

    // Kullanıcı: mevcut portal kullanıcısı varsa yeniden davet; yoksa oluştur
    let userId = contact.userId ?? null;
    if (!userId) {
      const dup = await prisma.user.findFirst({ where: { tenantId: admin.tenantId, email } });
      if (dup) return fail(new Error("Bu e-posta zaten kullanımda."));
      const created = await prisma.user.create({
        data: { tenantId: admin.tenantId, email, name: contact.name, isActive: false },
      });
      userId = created.id;
    }

    // SUPPLIER_USER rolü (tenant için) + kullanıcıya ata
    const role = await prisma.role.upsert({
      where: { tenantId_key: { tenantId: admin.tenantId, key: "SUPPLIER_USER" } },
      create: { tenantId: admin.tenantId, key: "SUPPLIER_USER", name: "Tedarikçi Kullanıcısı", permissions: "[]" },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });

    // Kalıcı davet token'ı (süresiz; revoke edilene kadar geçerli). Kişide ham saklanır.
    const raw = secureToken(32);
    await prisma.supplierContact.update({
      where: { id: contact.id },
      data: { userId, portalInviteToken: raw, portalInviteCreatedAt: new Date(), portalInviteRevokedAt: null },
    });
    await writeAudit({ tenantId: admin.tenantId, userId: admin.id, action: "UPDATE", entityType: "Supplier", entityId: supplier.id, after: { portalInvite: email } });
    revalidatePath(`/suppliers/${supplier.id}`);
    return ok({ url: `${env.APP_URL}/reset-password/${raw}`, email });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Portal erişimini pasife alır/yeniden aktifler. Pasife alınınca davet bağlantısı
 * geçersizleşir (revokedAt) ve kullanıcı giriş yapamaz (isActive=false). Aktif edince
 * bağlantı yeniden geçerli olur; kullanıcı parolasını belirlemiş/aktifse giriş açılır.
 */
export async function setPortalAccessActive(supplierId: string, active: boolean): Promise<Result<{ active: boolean }>> {
  try {
    const admin = await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, tenantId: admin.tenantId, deletedAt: null },
      include: { contacts: { where: { userId: { not: null } }, take: 1 } },
    });
    if (!supplier) throw new NotFoundError("Tedarikçi bulunamadı.");
    const contact = supplier.contacts[0];
    if (!contact?.userId) return fail(new Error("Portal kullanıcısı bulunamadı."));

    await prisma.$transaction(async (tx) => {
      await tx.supplierContact.update({
        where: { id: contact.id },
        data: { portalInviteRevokedAt: active ? null : new Date() },
      });
      // Aktif ederken yalnız parolası belirlenmiş kullanıcıyı giriş yapabilir yap.
      const u = await tx.user.findUnique({ where: { id: contact.userId! }, select: { passwordHash: true } });
      await tx.user.update({ where: { id: contact.userId! }, data: { isActive: active ? !!u?.passwordHash : false } });
    });
    await writeAudit({ tenantId: admin.tenantId, userId: admin.id, action: "UPDATE", entityType: "Supplier", entityId: supplier.id, after: { portalAccess: active ? "ACTIVATED" : "REVOKED" } });
    revalidatePath(`/suppliers/${supplier.id}`);
    return ok({ active });
  } catch (e) {
    return fail(e);
  }
}
