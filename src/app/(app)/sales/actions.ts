"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result, NotFoundError, ValidationError } from "@/lib/errors";
import { RFQ_STATUS } from "./rfqs/status";

// ---------------------------------------------------------------- MÜŞTERİ
const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Müşteri adı zorunlu."),
  country: z.string().default("TR"),
  industry: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email("Geçerli e-posta girin.").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  salesRepId: z.string().optional(),
  defaultCurrency: z.string().default("EUR"),
  notes: z.string().optional(),
});

async function nextCode(tenantId: string, prefix: string, pad = 4): Promise<string> {
  const count = await prisma.customer.count({ where: { tenantId } });
  return `${prefix}-${String(count + 1).padStart(pad, "0")}`;
}

export async function saveCustomer(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
    const data = customerSchema.parse(input);
    const base = {
      name: data.name, country: data.country || "TR", industry: data.industry || null,
      contactName: data.contactName || null, contactEmail: data.contactEmail || null, contactPhone: data.contactPhone || null,
      salesRepId: data.salesRepId || null, defaultCurrency: data.defaultCurrency || "EUR", notes: data.notes || null,
    };
    if (data.id) {
      const existing = await prisma.customer.findFirst({ where: { id: data.id, tenantId: user.tenantId } });
      if (!existing) throw new NotFoundError("Müşteri bulunamadı.");
      await prisma.customer.update({ where: { id: existing.id }, data: base });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "Customer", entityId: existing.id, after: { name: data.name } });
      revalidatePath("/sales/customers");
      return ok({ id: existing.id });
    }
    const code = await nextCode(user.tenantId, "MUS");
    const created = await prisma.customer.create({ data: { tenantId: user.tenantId, code, createdById: user.id, ...base } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "Customer", entityId: created.id, after: { code, name: data.name } });
    revalidatePath("/sales/customers");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- SALES RFQ
const rfqSchema = z.object({
  id: z.string().optional(),
  customerId: z.string().min(1, "Müşteri seçin."),
  industry: z.string().optional(),
  targetDate: z.string().optional(),
  salesRepId: z.string().optional(),
  coilType: z.string().optional(),
  notes: z.string().optional(),
});

export async function saveSalesRfq(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
    const data = rfqSchema.parse(input);
    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId: user.tenantId } });
    if (!customer) throw new ValidationError("Geçersiz müşteri.");
    const base = {
      customerId: data.customerId, industry: data.industry || customer.industry || null,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      salesRepId: data.salesRepId || customer.salesRepId || null, coilType: data.coilType || null, notes: data.notes || null,
    };
    if (data.id) {
      const existing = await prisma.salesRFQ.findFirst({ where: { id: data.id, tenantId: user.tenantId } });
      if (!existing) throw new NotFoundError("Talep bulunamadı.");
      await prisma.salesRFQ.update({ where: { id: existing.id }, data: base });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "SalesRFQ", entityId: existing.id, after: { customerId: data.customerId } });
      revalidatePath(`/sales/rfqs/${existing.id}`);
      return ok({ id: existing.id });
    }
    const year = new Date().getFullYear();
    const count = await prisma.salesRFQ.count({ where: { tenantId: user.tenantId } });
    const number = `SRFQ-${year}-${String(count + 1).padStart(4, "0")}`;
    const created = await prisma.salesRFQ.create({ data: { tenantId: user.tenantId, number, status: "REQUEST", createdById: user.id, ...base } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "SalesRFQ", entityId: created.id, after: { number, status: "REQUEST" } });
    revalidatePath("/sales/rfqs");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

const RFQ_STATUSES = RFQ_STATUS;
export async function setSalesRfqStatus(id: string, status: string): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
    if (!(RFQ_STATUSES as readonly string[]).includes(status)) throw new ValidationError("Geçersiz durum.");
    const rfq = await prisma.salesRFQ.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!rfq) throw new NotFoundError("Talep bulunamadı.");
    await prisma.salesRFQ.update({ where: { id: rfq.id }, data: { status } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "SalesRFQ", entityId: rfq.id, before: { status: rfq.status }, after: { status } });
    revalidatePath("/sales/rfqs");
    return ok({ status });
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSalesRfq(id: string): Promise<Result<null>> {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
    const rfq = await prisma.salesRFQ.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!rfq) throw new NotFoundError("Talep bulunamadı.");
    await prisma.salesRFQ.update({ where: { id: rfq.id }, data: { deletedAt: new Date(), status: "CANCELLED" } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "DELETE", entityType: "SalesRFQ", entityId: rfq.id });
    revalidatePath("/sales/rfqs");
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}
