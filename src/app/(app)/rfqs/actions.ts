"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser, requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { nextNumber } from "@/domain/numbering";
import { RFQ_TRANSITIONS, assertTransition } from "@/domain/state-machines";
import { writeAudit } from "@/lib/audit";
import { hashToken, secureToken } from "@/lib/ids";
import { addDays } from "@/lib/dates";
import { queueEmail, processQueue } from "@/lib/email/service";
import { rfqInviteTemplate, rfqReminderTemplate } from "@/lib/email/templates";
import { formatDateTime } from "@/lib/dates";
import { ok, fail, type Result, NotFoundError, AppError } from "@/lib/errors";

/**
 * Taslak/açık bir RFQ'yu İPTAL eder ve bağlı talep kalemlerini yeniden AÇAR
 * (status OPEN). Böylece tedarikçi seçmeden bırakılan RFQ'lar kalemleri kilitlemez;
 * satınalma aynı kalemler için yeniden RFQ oluşturabilir. Teklif alınmış RFQ iptal edilmez.
 */
export async function cancelRfq(rfqId: string): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.RFQ_CREATE);
    await prisma.$transaction(async (tx) => {
      const rfq = await tx.rFQ.findFirst({
        where: { id: rfqId, tenantId: user.tenantId },
        include: { lines: { select: { requisitionLineId: true } }, _count: { select: { bids: true } } },
      });
      if (!rfq) throw new NotFoundError("RFQ bulunamadı.");
      if (rfq.status === "AWARDED" || rfq.status === "CLOSED") throw new AppError("Karara bağlanmış RFQ iptal edilemez.");
      if (rfq._count.bids > 0) throw new AppError("Teklif alınmış RFQ iptal edilemez; değerlendirmeye devam edin.");

      // Bağlı talep kalemlerini yeniden aç
      const reqLineIds = rfq.lines.map((l) => l.requisitionLineId).filter((x): x is string => !!x);
      if (reqLineIds.length) {
        await tx.requisitionLine.updateMany({ where: { id: { in: reqLineIds } }, data: { status: "OPEN" } });
      }
      // İlgili taleplerin durumunu, açık kalemi olanları IN_RFQ'dan APPROVED'a çek
      const reqIds = await tx.requisitionLine.findMany({ where: { id: { in: reqLineIds } }, select: { requisitionId: true } });
      const uniqReqIds = [...new Set(reqIds.map((r) => r.requisitionId))];
      for (const rid of uniqReqIds) {
        const req = await tx.purchaseRequisition.findUnique({ where: { id: rid }, select: { status: true } });
        if (req?.status === "IN_RFQ") {
          await tx.purchaseRequisition.update({ where: { id: rid }, data: { status: "APPROVED" } });
        }
      }
      // Davetli tedarikçileri ve kalemleri temizle; RFQ başlığı soft-delete
      // (kayıt denetim için korunur, listelerden gizlenir).
      await tx.rFQSupplier.deleteMany({ where: { rfqId: rfq.id } });
      await tx.rFQLine.deleteMany({ where: { rfqId: rfq.id } });
      await tx.rFQ.update({ where: { id: rfq.id }, data: { deletedAt: new Date(), status: "CANCELLED" } });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "DELETE", entityType: "RFQ", entityId: rfq.id, before: { number: rfq.number, status: rfq.status }, reason: "RFQ iptal edildi (soft-delete); kalemler yeniden açıldı" }, tx);
    });
    revalidatePath("/rfqs");
    return ok({ id: rfqId });
  } catch (e) {
    return fail(e);
  }
}

/** Onaylı talepten RFQ oluşturur (satırları kopyalar). */
/**
 * Talepten RFQ oluşturur. Kalem seçimi ile KISMİ RFQ desteklenir: satınalma,
 * farklı tedarikçilere gidecek kalemleri ayrı ayrı seçip birden fazla RFQ
 * oluşturabilir (örn. hırdavat ile bakır teli aynı talepte ama ayrı RFQ'larda).
 *
 * @param lineIds Boş/verilmemişse talebin AÇIK (OPEN) tüm kalemleri; verilirse
 *   yalnızca seçilen açık kalemler RFQ'ya alınır. Kalan açık kalemlerden yeni
 *   RFQ oluşturmaya devam edilebilir.
 */
export async function createRfqFromRequisition(requisitionId: string, lineIds?: string[]): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.RFQ_CREATE);
    const created = await prisma.$transaction(async (tx) => {
      const req = await tx.purchaseRequisition.findFirst({
        where: { id: requisitionId, tenantId: user.tenantId },
        include: { lines: { orderBy: { lineNo: "asc" } } },
      });
      if (!req) throw new NotFoundError("Talep bulunamadı.");
      // Onaylı/atanmış talepten; kısmi RFQ için IN_RFQ durumunda da devam edilebilir
      if (!["APPROVED", "ASSIGNED", "IN_RFQ"].includes(req.status)) {
        throw new AppError("Yalnızca onaylanmış talepten RFQ oluşturulabilir.");
      }

      const openLines = req.lines.filter((l) => l.status === "OPEN");
      const selected = lineIds && lineIds.length > 0 ? openLines.filter((l) => lineIds.includes(l.id)) : openLines;
      if (selected.length === 0) {
        throw new AppError("RFQ'ya alınacak uygun (açık) kalem yok. Lütfen en az bir açık kalem seçin.");
      }

      const number = await nextNumber(tx, user.tenantId, "RFQ");
      const rfq = await tx.rFQ.create({
        data: {
          tenantId: user.tenantId,
          number,
          companyId: req.companyId,
          title: `${req.number} için teklif talebi`,
          status: "DRAFT",
          operationType: req.operationType,
          currencyOptions: JSON.stringify([req.currency]),
          dueAt: addDays(new Date(), 7),
          createdById: user.id,
          lines: {
            create: selected.map((l, i) => ({
              lineNo: i + 1,
              requisitionId: req.id,
              requisitionLineId: l.id,
              itemId: l.itemId,
              description: l.description,
              specs: l.specs,
              quantity: l.quantity,
              uom: l.uom,
              neededBy: l.neededBy,
            })),
          },
        },
      });

      // Seçili kalemleri IN_RFQ olarak işaretle (kalan açık kalemler yeni RFQ'ya alınabilir)
      await tx.requisitionLine.updateMany({
        where: { id: { in: selected.map((l) => l.id) } },
        data: { status: "IN_RFQ" },
      });

      await tx.purchaseRequisition.update({
        where: { id: req.id },
        data: { status: "IN_RFQ", assignedBuyerId: user.id },
      });
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "CREATE",
          entityType: "RFQ",
          entityId: rfq.id,
          after: { number, fromRequisition: req.number },
        },
        tx,
      );
      return rfq;
    });

    revalidatePath("/rfqs");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

const sendSchema = z.object({
  rfqId: z.string(),
  supplierIds: z.array(z.string()).min(1, "En az bir tedarikçi seçin."),
  dueAt: z.string().optional(),
  sealed: z.boolean().optional(),
});

/** Tedarikçileri davet eder, benzersiz magic link üretir, gerçek e-posta kuyruğa alır ve gönderir. */
export async function sendRfqToSuppliers(input: unknown): Promise<Result<{ sent: number }>> {
  try {
    const user = await requirePermission(PERMISSIONS.RFQ_SEND);
    const data = sendSchema.parse(input);

    const rfq = await prisma.rFQ.findFirst({
      where: { id: data.rfqId, tenantId: user.tenantId },
      include: { company: true, lines: true },
    });
    if (!rfq) throw new NotFoundError("RFQ bulunamadı.");
    if (!["DRAFT", "APPROVED", "SENT", "OPEN"].includes(rfq.status)) {
      throw new AppError("Bu RFQ durumunda tedarikçi daveti yapılamaz.");
    }

    const dueAt = data.dueAt ? new Date(data.dueAt) : (rfq.dueAt ?? addDays(new Date(), 7));
    const ttlHours = env.MAGIC_LINK_TTL_HOURS;
    const tokenExpiresAt = new Date(Math.min(dueAt.getTime(), Date.now() + ttlHours * 3600_000));

    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: data.supplierIds }, tenantId: user.tenantId },
      include: { contacts: { where: { isPrimary: true }, take: 1 } },
    });

    const lineSummary = rfq.lines
      .map((l) => `• ${l.description} (${l.quantity} ${l.uom ?? ""})`)
      .join("<br/>");

    // E-postalar transaction DIŞINDA kuyruğa alınır (SQLite'ta iç içe yazma kilidi olmasın)
    const emailsToQueue: Parameters<typeof queueEmail>[0][] = [];

    await prisma.$transaction(async (tx) => {
      for (const supplier of suppliers) {
        const existing = await tx.rFQSupplier.findUnique({
          where: { rfqId_supplierId: { rfqId: rfq.id, supplierId: supplier.id } },
        });
        const token = secureToken(32);
        const replyToken = secureToken(16);
        let rfqSupplierId: string;

        if (existing) {
          await tx.rFQSupplier.update({
            where: { id: existing.id },
            data: { tokenHash: hashToken(token), tokenExpiresAt, replyToken, status: "INVITED" },
          });
          rfqSupplierId = existing.id;
        } else {
          const rs = await tx.rFQSupplier.create({
            data: {
              rfqId: rfq.id,
              supplierId: supplier.id,
              tokenHash: hashToken(token),
              tokenExpiresAt,
              replyToken,
              status: "INVITED",
            },
          });
          rfqSupplierId = rs.id;
        }

        const magicLinkUrl = `${env.APP_URL}/teklif/${token}`;
        const contact = supplier.contacts[0];
        // E-posta dili tedarikçinin tercih ettiği dile göre otomatik belirlenir
        const supplierLocale = (supplier.preferredLanguage === "en" ? "en" : "tr") as "tr" | "en";
        const tmpl = rfqInviteTemplate(
          {
            supplierName: contact?.name ?? supplier.legalName,
            rfqNumber: rfq.number,
            title: rfq.title,
            dueAt: formatDateTime(dueAt),
            companyName: rfq.company.name,
            magicLinkUrl,
            lineSummary,
          },
          supplierLocale,
        );

        // Reply-To benzersiz token içerir => gelen yanıt doğru RFQ'ya bağlanır
        const replyTo = `rfq+${replyToken}@${env.EMAIL_INBOUND_DOMAIN}`;
        emailsToQueue.push({
          tenantId: user.tenantId,
          to: contact?.email ?? `${supplier.code}@tedarikci.example`,
          subject: `[${rfq.number}] ${tmpl.subject}`,
          html: tmpl.html,
          text: tmpl.text,
          replyTo,
          templateKey: "rfq_invite",
          refType: "RFQ",
          refId: rfq.id,
        });

        await tx.rFQMessage.create({
          data: {
            rfqId: rfq.id,
            supplierId: supplier.id,
            direction: "OUTBOUND",
            subject: tmpl.subject,
            body: "Teklif daveti gönderildi (magic link).",
          },
        });
        void rfqSupplierId;
      }

      assertTransition(RFQ_TRANSITIONS, rfq.status, "SENT", "RFQ");
      await tx.rFQ.update({
        where: { id: rfq.id },
        data: { status: "SENT", dueAt, sealed: data.sealed ?? rfq.sealed },
      });
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "STATUS_CHANGE",
          entityType: "RFQ",
          entityId: rfq.id,
          after: { status: "SENT", suppliers: suppliers.length },
        },
        tx,
      );
    });

    // E-postaları transaction'dan SONRA kuyruğa al (SQLite iç içe yazma kilidi olmaz)
    for (const e of emailsToQueue) {
      await queueEmail(e);
    }

    // Kuyruğu işle (gerçek gönderim; mock modda konsola loglar)
    const result = await processQueue();

    // SENT -> OPEN (teklif toplamaya açık)
    await prisma.rFQ.update({ where: { id: rfq.id }, data: { status: "OPEN" } });

    revalidatePath(`/rfqs/${rfq.id}`);
    return ok({ sent: result.sent });
  } catch (e) {
    return fail(e);
  }
}

/** Yanıt vermeyen tedarikçilere hatırlatma gönderir. */
export async function sendRfqReminders(rfqId: string): Promise<Result<{ sent: number }>> {
  try {
    const user = await requirePermission(PERMISSIONS.RFQ_SEND);
    const rfq = await prisma.rFQ.findFirst({
      where: { id: rfqId, tenantId: user.tenantId },
      include: {
        company: true,
        suppliers: {
          where: { status: { in: ["INVITED", "VIEWED"] } },
          include: { supplier: { include: { contacts: { where: { isPrimary: true }, take: 1 } } } },
        },
      },
    });
    if (!rfq) throw new NotFoundError("RFQ bulunamadı.");

    for (const rs of rfq.suppliers) {
      const token = secureToken(32);
      await prisma.rFQSupplier.update({
        where: { id: rs.id },
        data: { tokenHash: hashToken(token), remindersSent: { increment: 1 } },
      });
      const contact = rs.supplier.contacts[0];
      const tmpl = rfqReminderTemplate({
        supplierName: contact?.name ?? rs.supplier.legalName,
        rfqNumber: rfq.number,
        dueAt: formatDateTime(rfq.dueAt ?? new Date()),
        magicLinkUrl: `${env.APP_URL}/teklif/${token}`,
      });
      await queueEmail({
        tenantId: user.tenantId,
        to: contact?.email ?? `${rs.supplier.code}@tedarikci.example`,
        subject: `[${rfq.number}] ${tmpl.subject}`,
        html: tmpl.html,
        text: tmpl.text,
        templateKey: "rfq_reminder",
        refType: "RFQ",
        refId: rfq.id,
      });
    }
    const result = await processQueue();
    revalidatePath(`/rfqs/${rfqId}`);
    return ok({ sent: result.sent });
  } catch (e) {
    return fail(e);
  }
}

/** Değerlendirme aşamasına geçir. */
export async function moveRfqToEvaluation(rfqId: string): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.RFQ_EVALUATE);
    const rfq = await prisma.rFQ.findFirst({ where: { id: rfqId, tenantId: user.tenantId } });
    if (!rfq) throw new NotFoundError("RFQ bulunamadı.");
    assertTransition(RFQ_TRANSITIONS, rfq.status, "EVALUATION", "RFQ");
    await prisma.rFQ.update({ where: { id: rfq.id }, data: { status: "EVALUATION" } });
    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "STATUS_CHANGE",
      entityType: "RFQ",
      entityId: rfq.id,
      after: { status: "EVALUATION" },
    });
    revalidatePath(`/rfqs/${rfqId}`);
    return ok({ status: "EVALUATION" });
  } catch (e) {
    return fail(e);
  }
}
