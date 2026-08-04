"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result, NotFoundError, ValidationError } from "@/lib/errors";
import { parseTrNumber, toStr } from "@/lib/money";
import { RFQ_STATUS } from "./rfqs/status";
import { OFFER_STATUS } from "./offers/status";

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

// ---------------------------------------------------------------- SALES OFFER
async function nextOfferNumber(tenantId: string): Promise<string> {
  const count = await prisma.salesOffer.count({ where: { tenantId } });
  return `CP${7000 + count + 1}`;
}

/** RFQ → Teklif dönüştürme: müşteri/sektör/temsilci/bobin bilgilerini taşır, taslak teklif oluşturur. */
export async function createOfferFromRfq(rfqId: string): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
    const rfq = await prisma.salesRFQ.findFirst({ where: { id: rfqId, tenantId: user.tenantId, deletedAt: null }, include: { customer: true } });
    if (!rfq) throw new NotFoundError("Talep bulunamadı.");
    const number = await nextOfferNumber(user.tenantId);
    const created = await prisma.$transaction(async (tx) => {
      const offer = await tx.salesOffer.create({
        data: {
          tenantId: user.tenantId, number, salesRfqId: rfq.id, customerId: rfq.customerId,
          status: "OPEN", currency: rfq.customer.defaultCurrency || "EUR",
          salesRepId: rfq.salesRepId || rfq.customer.salesRepId || null, createdById: user.id,
          technicalDetail: { create: { typeOfCoil: rfq.coilType || null } },
        },
      });
      if (rfq.status !== "OFFERED") await tx.salesRFQ.update({ where: { id: rfq.id }, data: { status: "OFFERED" } });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "SalesOffer", entityId: offer.id, after: { number, fromRfq: rfq.number } }, tx);
      return offer;
    });
    revalidatePath("/sales/offers");
    revalidatePath(`/sales/rfqs/${rfq.id}`);
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

const offerSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  currency: z.string().default("EUR"),
  totalAmount: z.string().optional(),
  offerDate: z.string().optional(),
  validUntil: z.string().optional(),
  deliveryDate: z.string().optional(),
  invoiced: z.boolean().optional(),
  reason: z.string().optional(),
  salesRepId: z.string().optional(),
  // teknik detay
  manufacturer: z.string().optional(),
  type: z.string().optional(),
  power: z.string().optional(),
  voltage: z.string().optional(),
  numberOfPole: z.string().optional(),
  numberOfCoils: z.string().optional(),
  numberOfSlot: z.string().optional(),
  numberOfSet: z.string().optional(),
  numberOfTurns: z.string().optional(),
  insulationType: z.string().optional(),
  typeOfCoil: z.string().optional(),
  wireWidth: z.string().optional(),
  wireThickness: z.string().optional(),
  lmeRecordId: z.string().optional(),
});

const toInt = (v?: string): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
const orNull = (v?: string): string | null => (v && v.trim() !== "" ? v.trim() : null);

export async function saveOfferInfo(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
    const data = offerSchema.parse(input);
    if (!(OFFER_STATUS as readonly string[]).includes(data.status)) throw new ValidationError("Geçersiz teklif durumu.");
    const offer = await prisma.salesOffer.findFirst({ where: { id: data.id, tenantId: user.tenantId, deletedAt: null } });
    if (!offer) throw new NotFoundError("Teklif bulunamadı.");
    // LME referansı doğrulama (varsa onaylı ve aynı tenant olmalı)
    let lmeRecordId: string | null = null;
    if (data.lmeRecordId) {
      const lme = await prisma.lmeRecord.findFirst({ where: { id: data.lmeRecordId, tenantId: user.tenantId, status: "APPROVED" }, select: { id: true } });
      if (!lme) throw new ValidationError("Seçilen LME kaydı geçersiz veya onaylı değil.");
      lmeRecordId = lme.id;
    }
    const totalAmount = data.totalAmount != null && data.totalAmount.trim() !== "" ? toStr(parseTrNumber(data.totalAmount)) : offer.totalAmount;

    await prisma.$transaction(async (tx) => {
      await tx.salesOffer.update({
        where: { id: offer.id },
        data: {
          status: data.status, currency: data.currency || "EUR", totalAmount,
          offerDate: data.offerDate ? new Date(data.offerDate) : offer.offerDate,
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
          deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
          invoiced: data.invoiced ?? offer.invoiced,
          reason: orNull(data.reason), salesRepId: orNull(data.salesRepId),
        },
      });
      await tx.salesOfferTechnicalDetail.upsert({
        where: { offerId: offer.id },
        create: {
          offerId: offer.id, manufacturer: orNull(data.manufacturer), type: orNull(data.type), power: orNull(data.power), voltage: orNull(data.voltage),
          numberOfPole: toInt(data.numberOfPole), numberOfCoils: toInt(data.numberOfCoils), numberOfSlot: toInt(data.numberOfSlot),
          numberOfSet: toInt(data.numberOfSet), numberOfTurns: toInt(data.numberOfTurns), insulationType: orNull(data.insulationType),
          typeOfCoil: orNull(data.typeOfCoil), wireWidth: orNull(data.wireWidth), wireThickness: orNull(data.wireThickness), lmeRecordId,
        },
        update: {
          manufacturer: orNull(data.manufacturer), type: orNull(data.type), power: orNull(data.power), voltage: orNull(data.voltage),
          numberOfPole: toInt(data.numberOfPole), numberOfCoils: toInt(data.numberOfCoils), numberOfSlot: toInt(data.numberOfSlot),
          numberOfSet: toInt(data.numberOfSet), numberOfTurns: toInt(data.numberOfTurns), insulationType: orNull(data.insulationType),
          typeOfCoil: orNull(data.typeOfCoil), wireWidth: orNull(data.wireWidth), wireThickness: orNull(data.wireThickness), lmeRecordId,
        },
      });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "SalesOffer", entityId: offer.id, before: { status: offer.status, totalAmount: offer.totalAmount }, after: { status: data.status, totalAmount } }, tx);
    });
    revalidatePath(`/sales/offers/${offer.id}`);
    revalidatePath("/sales/offers");
    return ok({ id: offer.id });
  } catch (e) {
    return fail(e);
  }
}

/** Revizyon: revisionNo +1, revisionDate güncelle; önceki değerleri zaman çizelgesine sistem notu olarak düşer. */
export async function reviseOffer(offerId: string): Promise<Result<{ revisionNo: number }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
    const offer = await prisma.salesOffer.findFirst({ where: { id: offerId, tenantId: user.tenantId, deletedAt: null } });
    if (!offer) throw new NotFoundError("Teklif bulunamadı.");
    const nextRev = offer.revisionNo + 1;
    const snapshot = `Tutar: ${offer.totalAmount} ${offer.currency} · Durum: ${offer.status}`;
    await prisma.$transaction(async (tx) => {
      await tx.salesOffer.update({ where: { id: offer.id }, data: { revisionNo: nextRev, revisionDate: new Date() } });
      await tx.salesOfferNote.create({ data: { offerId: offer.id, title: `🔄 Revizyon (Rev ${String.fromCharCode(65 + offer.revisionNo)} kapandı)`, body: snapshot, createdById: user.id } });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "REVISION", entityType: "SalesOffer", entityId: offer.id, before: { revisionNo: offer.revisionNo }, after: { revisionNo: nextRev } }, tx);
    });
    revalidatePath(`/sales/offers/${offer.id}`);
    return ok({ revisionNo: nextRev });
  } catch (e) {
    return fail(e);
  }
}

const noteSchema = z.object({ offerId: z.string().min(1), title: z.string().optional(), body: z.string().min(1, "Not içeriği zorunlu.") });
export async function addOfferNote(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
    const data = noteSchema.parse(input);
    const offer = await prisma.salesOffer.findFirst({ where: { id: data.offerId, tenantId: user.tenantId, deletedAt: null }, select: { id: true } });
    if (!offer) throw new NotFoundError("Teklif bulunamadı.");
    const note = await prisma.salesOfferNote.create({ data: { offerId: offer.id, title: orNull(data.title), body: data.body, createdById: user.id } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "SalesOfferNote", entityId: note.id });
    revalidatePath(`/sales/offers/${offer.id}`);
    return ok({ id: note.id });
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOfferNote(noteId: string): Promise<Result<null>> {
  try {
    const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
    const note = await prisma.salesOfferNote.findFirst({ where: { id: noteId, offer: { tenantId: user.tenantId } }, select: { id: true, offerId: true } });
    if (!note) throw new NotFoundError("Not bulunamadı.");
    await prisma.salesOfferNote.delete({ where: { id: note.id } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "DELETE", entityType: "SalesOfferNote", entityId: note.id });
    revalidatePath(`/sales/offers/${note.offerId}`);
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}
