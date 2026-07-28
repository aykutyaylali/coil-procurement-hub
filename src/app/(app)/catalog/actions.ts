"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { toStr } from "@/lib/money";
import { ok, fail, type Result, ConflictError, NotFoundError } from "@/lib/errors";

const schema = z.object({
  code: z.string().min(1, "Ürün kodu zorunlu."),
  name: z.string().min(1, "Ad zorunlu."),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  manufacturer: z.string().optional(),
  manufacturerCode: z.string().optional(),
  gtipCode: z.string().optional(),
  baseUomId: z.string().optional(),
  minOrderQty: z.string().optional(),
  leadTimeDays: z.string().optional(),
  specs: z.string().optional(),
  altCodes: z.string().optional(),
  isService: z.boolean().default(false),
  isActive: z.boolean().default(true),
  preferredSuppliers: z.array(z.string()).default([]),
  unitConversions: z.array(z.object({ fromUom: z.string(), toUom: z.string(), factor: z.string() })).default([]),
});

export async function createItem(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const data = schema.parse(input);
    const dup = await prisma.item.findFirst({ where: { tenantId: user.tenantId, code: data.code } });
    if (dup) throw new ConflictError("Bu ürün kodu zaten mevcut.");
    const item = await prisma.item.create({
      data: {
        tenantId: user.tenantId, code: data.code, name: data.name, description: data.description || null,
        categoryId: data.categoryId || null, brand: data.brand || null, manufacturer: data.manufacturer || null,
        manufacturerCode: data.manufacturerCode || null, gtipCode: data.gtipCode || null,
        baseUomId: data.baseUomId || null, minOrderQty: data.minOrderQty ? toStr(data.minOrderQty, 4) : null,
        leadTimeDays: data.leadTimeDays ? parseInt(data.leadTimeDays, 10) : null,
        specs: data.specs || null, altCodes: data.altCodes || null,
        isService: data.isService, isActive: data.isActive,
        preferredSuppliers: data.preferredSuppliers.length ? JSON.stringify(data.preferredSuppliers) : null,
        unitConversions: data.unitConversions.length ? JSON.stringify(data.unitConversions) : null,
      },
    });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "Item", entityId: item.id, after: { code: data.code, name: data.name } });
    revalidatePath("/catalog");
    return ok({ id: item.id });
  } catch (e) {
    return fail(e);
  }
}

export async function updateItem(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const data = schema.extend({ id: z.string() }).parse(input);
    const existing = await prisma.item.findFirst({ where: { id: data.id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundError("Ürün bulunamadı.");
    await prisma.item.update({
      where: { id: existing.id },
      data: {
        name: data.name, description: data.description || null, categoryId: data.categoryId || null,
        brand: data.brand || null, manufacturer: data.manufacturer || null, manufacturerCode: data.manufacturerCode || null,
        gtipCode: data.gtipCode || null, baseUomId: data.baseUomId || null,
        minOrderQty: data.minOrderQty ? toStr(data.minOrderQty, 4) : null,
        leadTimeDays: data.leadTimeDays ? parseInt(data.leadTimeDays, 10) : null,
        specs: data.specs || null, altCodes: data.altCodes || null, isService: data.isService, isActive: data.isActive,
        preferredSuppliers: data.preferredSuppliers.length ? JSON.stringify(data.preferredSuppliers) : null,
        unitConversions: data.unitConversions.length ? JSON.stringify(data.unitConversions) : null,
      },
    });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "Item", entityId: existing.id, after: { name: data.name } });
    revalidatePath(`/catalog/${existing.id}`);
    return ok({ id: existing.id });
  } catch (e) {
    return fail(e);
  }
}

/** Basit CSV içe aktarma: kod;ad;kategori;marka;birim;gtip;fiyat (başlık satırı). Upsert. */
export async function importItemsCsv(csvText: string): Promise<Result<{ created: number; updated: number; skipped: number }>> {
  try {
    const user = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new Error("CSV boş veya yalnızca başlık içeriyor.");
    const delim = lines[0]!.includes(";") ? ";" : ",";
    const rows = lines.slice(1).map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, "")));

    const cats = await prisma.category.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true } });
    const catByName = new Map(cats.map((c) => [c.name.toLocaleLowerCase("tr"), c.id]));

    let created = 0, updated = 0, skipped = 0;
    for (const r of rows) {
      const [code, name, catName, brand, , gtip, price] = r;
      if (!code || !name) { skipped++; continue; }
      const categoryId = catName ? catByName.get(catName.toLocaleLowerCase("tr")) ?? null : null;
      const existing = await prisma.item.findFirst({ where: { tenantId: user.tenantId, code } });
      const dataFields = { name, brand: brand || null, gtipCode: gtip || null, categoryId, lastPurchasePrice: price ? toStr(price, 4) : null, lastPurchaseCurrency: price ? "TRY" : null };
      if (existing) { await prisma.item.update({ where: { id: existing.id }, data: dataFields }); updated++; }
      else { await prisma.item.create({ data: { tenantId: user.tenantId, code, ...dataFields } }); created++; }
    }
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "IMPORT", entityType: "Item", entityId: "catalog-csv", after: { created, updated, skipped } });
    revalidatePath("/catalog");
    return ok({ created, updated, skipped });
  } catch (e) {
    return fail(e);
  }
}
