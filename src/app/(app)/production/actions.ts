"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result, NotFoundError, ValidationError } from "@/lib/errors";
import { elapsedMinutes } from "@/domain/production";
import { WORK_ORDER_STATUS, LOG_STATUS } from "./constants";

// =====================================================================
// İŞ EMRİ YÖNETİMİ (production.manage)
// =====================================================================
const workOrderSchema = z.object({
  id: z.string().optional(),
  number: z.string().optional(), // boşsa otomatik
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  salesOfferId: z.string().optional(),
  coilType: z.string().optional(),
  line: z.string().optional(),
  targetCoils: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

const toInt = (v?: string): number => {
  if (v == null || v.trim() === "") return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const orNull = (v?: string): string | null => (v && v.trim() !== "" ? v.trim() : null);

async function nextWorkOrderNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.workOrder.count({ where: { tenantId } });
  return `WO-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function saveWorkOrder(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_MANAGE);
    const data = workOrderSchema.parse(input);

    // Müşteri adı: customerId verildiyse çöz, aksi halde serbest metin.
    let customerName = orNull(data.customerName);
    let customerId: string | null = null;
    if (data.customerId) {
      const c = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId: user.tenantId }, select: { id: true, name: true } });
      if (c) { customerId = c.id; customerName = c.name; }
    }

    const base = {
      customerId, customerName, salesOfferId: orNull(data.salesOfferId), coilType: orNull(data.coilType),
      line: orNull(data.line), targetCoils: toInt(data.targetCoils),
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      notes: orNull(data.notes),
    };

    if (data.id) {
      const existing = await prisma.workOrder.findFirst({ where: { id: data.id, tenantId: user.tenantId } });
      if (!existing) throw new NotFoundError("İş emri bulunamadı.");
      await prisma.workOrder.update({ where: { id: existing.id }, data: base });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "WorkOrder", entityId: existing.id, after: { number: existing.number } });
      revalidatePath(`/production/work-orders/${existing.id}`);
      revalidatePath("/production/work-orders");
      return ok({ id: existing.id });
    }

    const number = orNull(data.number) ?? (await nextWorkOrderNumber(user.tenantId));
    const dup = await prisma.workOrder.findFirst({ where: { tenantId: user.tenantId, number }, select: { id: true } });
    if (dup) throw new ValidationError("Bu iş emri numarası zaten var.");
    const created = await prisma.workOrder.create({ data: { tenantId: user.tenantId, number, status: "PLANNED", createdById: user.id, ...base } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "WorkOrder", entityId: created.id, after: { number } });
    revalidatePath("/production/work-orders");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

export async function setWorkOrderStatus(id: string, status: string): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_MANAGE);
    if (!(WORK_ORDER_STATUS as readonly string[]).includes(status)) throw new ValidationError("Geçersiz durum.");
    const wo = await prisma.workOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!wo) throw new NotFoundError("İş emri bulunamadı.");
    const patch: Record<string, unknown> = { status };
    if (status === "IN_PROGRESS" && !wo.startDate) patch.startDate = new Date();
    if (status === "COMPLETED" && !wo.endDate) patch.endDate = new Date();
    await prisma.workOrder.update({ where: { id: wo.id }, data: patch });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "WorkOrder", entityId: wo.id, before: { status: wo.status }, after: { status } });
    revalidatePath("/production/work-orders");
    revalidatePath(`/production/work-orders/${wo.id}`);
    return ok({ status });
  } catch (e) {
    return fail(e);
  }
}

export async function deleteWorkOrder(id: string): Promise<Result<null>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_MANAGE);
    const wo = await prisma.workOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!wo) throw new NotFoundError("İş emri bulunamadı.");
    await prisma.workOrder.delete({ where: { id: wo.id } }); // ProductionLog cascade
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "DELETE", entityType: "WorkOrder", entityId: wo.id });
    revalidatePath("/production/work-orders");
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}

// =====================================================================
// SAHA TERMİNALİ (production.operate)
// =====================================================================
export type OperatorInfo = { id: string; name: string; employeeNo: string; badgeCode: string; line: string | null; title: string | null };
export type WorkOrderInfo = {
  id: string; number: string; customerName: string | null; coilType: string | null; line: string | null;
  targetCoils: number; completedCoils: number; status: string;
};

/** Operatör rozet barkodunu çöz (aktif operatör). */
export async function resolveOperator(badgeCode: string): Promise<Result<OperatorInfo>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_OPERATE);
    const code = badgeCode.trim();
    if (!code) throw new ValidationError("Rozet kodu boş.");
    const op = await prisma.productionOperator.findFirst({ where: { tenantId: user.tenantId, badgeCode: code, isActive: true } });
    if (!op) throw new NotFoundError(`Operatör bulunamadı: ${code}`);
    return ok({ id: op.id, name: op.name, employeeNo: op.employeeNo, badgeCode: op.badgeCode, line: op.line, title: op.title });
  } catch (e) {
    return fail(e);
  }
}

/** İş emri barkodunu çöz (WO-... veya bobin kodu). */
export async function resolveWorkOrder(code: string): Promise<Result<WorkOrderInfo>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_OPERATE);
    const num = code.trim();
    if (!num) throw new ValidationError("İş emri kodu boş.");
    const wo = await prisma.workOrder.findFirst({ where: { tenantId: user.tenantId, number: num } });
    if (!wo) throw new NotFoundError(`İş emri bulunamadı: ${num}`);
    if (wo.status === "CANCELLED") throw new ValidationError("İş emri iptal edilmiş.");
    return ok({
      id: wo.id, number: wo.number, customerName: wo.customerName, coilType: wo.coilType, line: wo.line,
      targetCoils: wo.targetCoils, completedCoils: wo.completedCoils, status: wo.status,
    });
  } catch (e) {
    return fail(e);
  }
}

export type SessionInfo = {
  logId: string; status: string; producedQty: number; scrapQty: number;
  stationCode: string; stationName: string; operatorName: string;
  workOrderNumber: string; workOrderId: string; targetCoils: number; completedCoils: number;
};

const startSchema = z.object({
  stationId: z.string().min(1),
  operatorId: z.string().min(1),
  workOrderId: z.string().min(1),
  barcode: z.string().optional(),
});

async function loadSession(tenantId: string, logId: string): Promise<SessionInfo> {
  const log = await prisma.productionLog.findFirst({
    where: { id: logId, tenantId },
    include: { station: true, operator: true, workOrder: true },
  });
  if (!log) throw new NotFoundError("Oturum bulunamadı.");
  return {
    logId: log.id, status: log.status, producedQty: log.producedQty, scrapQty: log.scrapQty,
    stationCode: log.station.code, stationName: log.station.name, operatorName: log.operator.name,
    workOrderNumber: log.workOrder.number, workOrderId: log.workOrderId,
    targetCoils: log.workOrder.targetCoils, completedCoils: log.workOrder.completedCoils,
  };
}

/** Oturum başlat (check-in). Aynı operatör+istasyon+iş emri için açık oturum varsa onu sürdürür. */
export async function startSession(input: unknown): Promise<Result<SessionInfo>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_OPERATE);
    const data = startSchema.parse(input);
    const [station, operator, wo] = await Promise.all([
      prisma.productionStation.findFirst({ where: { id: data.stationId, tenantId: user.tenantId, isActive: true }, select: { id: true } }),
      prisma.productionOperator.findFirst({ where: { id: data.operatorId, tenantId: user.tenantId, isActive: true }, select: { id: true } }),
      prisma.workOrder.findFirst({ where: { id: data.workOrderId, tenantId: user.tenantId }, select: { id: true, status: true } }),
    ]);
    if (!station) throw new ValidationError("Geçersiz istasyon.");
    if (!operator) throw new ValidationError("Geçersiz operatör.");
    if (!wo) throw new ValidationError("Geçersiz iş emri.");
    if (wo.status === "CANCELLED") throw new ValidationError("İş emri iptal edilmiş.");

    const open = await prisma.productionLog.findFirst({
      where: { tenantId: user.tenantId, stationId: station.id, operatorId: operator.id, workOrderId: wo.id, checkOutAt: null },
      orderBy: { checkInAt: "desc" },
    });
    let logId: string;
    if (open) {
      if (open.status === "PAUSED") await prisma.productionLog.update({ where: { id: open.id }, data: { status: "ACTIVE" } });
      logId = open.id;
    } else {
      const created = await prisma.productionLog.create({
        data: {
          tenantId: user.tenantId, workOrderId: wo.id, stationId: station.id, operatorId: operator.id,
          scannedBarcode: orNull(data.barcode), status: "ACTIVE", checkInAt: new Date(),
        },
      });
      logId = created.id;
      if (wo.status === "PLANNED") await prisma.workOrder.update({ where: { id: wo.id }, data: { status: "IN_PROGRESS", startDate: new Date() } });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "CHECK_IN", entityType: "ProductionLog", entityId: created.id, after: { workOrderId: wo.id, stationId: station.id, operatorId: operator.id } });
    }
    revalidatePath("/production/dashboard");
    return ok(await loadSession(user.tenantId, logId));
  } catch (e) {
    return fail(e);
  }
}

async function requireActiveLog(tenantId: string, logId: string) {
  const log = await prisma.productionLog.findFirst({ where: { id: logId, tenantId } });
  if (!log) throw new NotFoundError("Oturum bulunamadı.");
  if (log.checkOutAt) throw new ValidationError("Oturum kapanmış; yeniden başlatın.");
  return log;
}

/** Bobin tamamlandı (+n): kaydın üretim adedini ve iş emri tamamlananını artırır. */
export async function recordCoil(logId: string, count = 1): Promise<Result<SessionInfo>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_OPERATE);
    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
    const log = await requireActiveLog(user.tenantId, logId);
    await prisma.$transaction(async (tx) => {
      await tx.productionLog.update({ where: { id: log.id }, data: { producedQty: { increment: n }, status: "ACTIVE" } });
      const wo = await tx.workOrder.update({ where: { id: log.workOrderId }, data: { completedCoils: { increment: n } } });
      const patch: Record<string, unknown> = {};
      if (wo.status === "PLANNED") { patch.status = "IN_PROGRESS"; if (!wo.startDate) patch.startDate = new Date(); }
      if (wo.targetCoils > 0 && wo.completedCoils >= wo.targetCoils && wo.status !== "COMPLETED") { patch.status = "COMPLETED"; patch.endDate = new Date(); }
      if (Object.keys(patch).length) await tx.workOrder.update({ where: { id: wo.id }, data: patch });
    });
    revalidatePath("/production/dashboard");
    return ok(await loadSession(user.tenantId, log.id));
  } catch (e) {
    return fail(e);
  }
}

/** Fire / hata gir (+n). Tamamlanan bobine SAYILMAZ. */
export async function recordScrap(logId: string, count = 1): Promise<Result<SessionInfo>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_OPERATE);
    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
    const log = await requireActiveLog(user.tenantId, logId);
    await prisma.productionLog.update({ where: { id: log.id }, data: { scrapQty: { increment: n } } });
    revalidatePath("/production/dashboard");
    return ok(await loadSession(user.tenantId, log.id));
  } catch (e) {
    return fail(e);
  }
}

/** Mola / Devam (PAUSED <-> ACTIVE). */
export async function setSessionStatus(logId: string, status: string): Promise<Result<SessionInfo>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_OPERATE);
    if (!(LOG_STATUS as readonly string[]).includes(status) || status === "DONE") throw new ValidationError("Geçersiz durum.");
    const log = await requireActiveLog(user.tenantId, logId);
    await prisma.productionLog.update({ where: { id: log.id }, data: { status } });
    revalidatePath("/production/dashboard");
    return ok(await loadSession(user.tenantId, log.id));
  } catch (e) {
    return fail(e);
  }
}

/** Tamamla / Çıkış (check-out): oturumu kapatır, geçen süreyi hesaplar. */
export async function checkOut(logId: string): Promise<Result<SessionInfo>> {
  try {
    const user = await requirePermission(PERMISSIONS.PRODUCTION_OPERATE);
    const log = await requireActiveLog(user.tenantId, logId);
    const now = new Date();
    await prisma.productionLog.update({
      where: { id: log.id },
      data: { status: "DONE", checkOutAt: now, elapsedMinutes: elapsedMinutes(log.checkInAt, now) },
    });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "CHECK_OUT", entityType: "ProductionLog", entityId: log.id, after: { producedQty: log.producedQty, scrapQty: log.scrapQty } });
    revalidatePath("/production/dashboard");
    return ok(await loadSession(user.tenantId, log.id));
  } catch (e) {
    return fail(e);
  }
}
