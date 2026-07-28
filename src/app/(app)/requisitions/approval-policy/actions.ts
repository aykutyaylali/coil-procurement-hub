"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { toStr } from "@/lib/money";
import { ok, fail, type Result, NotFoundError } from "@/lib/errors";
import { mergeReqApprovalPolicy, type ReqApprovalMode } from "@/domain/approval-policy";

const schema = z.object({
  companyId: z.string().min(1),
  mode: z.enum(["ALWAYS", "THRESHOLD", "NEVER"]),
  threshold: z.string().optional().default("0"),
});

/**
 * Talep onay politikasını günceller. SATINALMA yetkisi (REQUISITION_ASSIGN) gerektirir;
 * "onaya gidecek mi" kararını satınalma belirler.
 */
export async function updateReqApprovalPolicy(input: unknown): Promise<Result<{ companyId: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.REQUISITION_ASSIGN);
    const data = schema.parse(input);

    const company = await prisma.company.findFirst({ where: { id: data.companyId, tenantId: user.tenantId } });
    if (!company) throw new NotFoundError("Şirket bulunamadı.");

    const threshold = data.mode === "THRESHOLD" ? toStr(data.threshold || "0", 2) : "0";
    const settings = mergeReqApprovalPolicy(company.settings, { mode: data.mode as ReqApprovalMode, threshold });

    await prisma.company.update({ where: { id: company.id }, data: { settings } });
    await writeAudit({
      tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "Company", entityId: company.id,
      after: { reqApproval: { mode: data.mode, threshold } }, reason: "Talep onay politikası güncellendi",
    });
    revalidatePath("/requisitions/approval-policy");
    return ok({ companyId: company.id });
  } catch (e) {
    return fail(e);
  }
}
