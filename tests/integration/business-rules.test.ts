import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { actOnApproval } from "@/domain/approval";
import { ROLE_KEYS } from "@/lib/rbac";

/**
 * İş kuralı entegrasyon testleri — gerçek (SQLite dev) veritabanına karşı.
 * Tüm testler rollback transaction içinde çalışır; hiçbir veri kalıcı yazılmaz.
 */
async function inRollback<T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await prisma.$transaction(async (tx) => {
      result = await fn(tx);
      throw new Error("__ROLLBACK__");
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__ROLLBACK__") throw e;
  }
  return result;
}

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedInstance(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], creatorId: string, opts: { approverUserId?: string | null; approverRoleKey?: string | null; enforceSegregation?: boolean }) {
  const tenant = await tx.tenant.findFirst();
  const wf = await tx.approvalWorkflow.create({ data: { tenantId: tenant!.id, key: "TEST_" + Date.now(), name: "Test", documentType: "TEST" } });
  const steps = [{
    sequence: 0, name: "Adım", approverType: opts.approverRoleKey ? "ROLE" : "USER",
    approverValue: opts.approverRoleKey ?? opts.approverUserId ?? null,
    approverUserId: opts.approverUserId ?? null, approverRoleKey: opts.approverRoleKey ?? null,
    slaHours: null, enforceSegregation: opts.enforceSegregation ?? true, status: "PENDING",
  }];
  const inst = await tx.approvalInstance.create({ data: { workflowId: wf.id, documentType: "TEST", documentId: "doc-" + Date.now(), status: "PENDING", currentStep: 0, stepsState: JSON.stringify(steps) } });
  return inst.id;
}

describe("iş kuralları — onay motoru (gerçek DB, rollback)", () => {
  it("görevler ayrılığı: kişi kendi belgesini onaylayamaz", async () => {
    const outcome = await inRollback(async (tx) => {
      const tenant = await tx.tenant.findFirst();
      const creator = await tx.user.create({ data: { tenantId: tenant!.id, email: "creator@test.local", name: "Creator" } });
      const instanceId = await seedInstance(tx, creator.id, { approverRoleKey: ROLE_KEYS.PURCHASING_MANAGER, enforceSegregation: true });
      let blocked = false;
      try {
        await actOnApproval(tx, { instanceId, userId: creator.id, userRoleKeys: [ROLE_KEYS.PURCHASING_MANAGER], documentCreatorId: creator.id, action: "APPROVE" });
      } catch (e) {
        blocked = e instanceof Error && e.message.includes("kendi oluşturduğunuz");
      }
      return { blocked };
    });
    expect(outcome.blocked).toBe(true);
  });

  it("başka bir yetkili onaylayabilir (görevler ayrılığı ihlali yok)", async () => {
    const outcome = await inRollback(async (tx) => {
      const tenant = await tx.tenant.findFirst();
      const creator = await tx.user.create({ data: { tenantId: tenant!.id, email: "c2@test.local", name: "C2" } });
      const approver = await tx.user.create({ data: { tenantId: tenant!.id, email: "a2@test.local", name: "A2" } });
      const instanceId = await seedInstance(tx, creator.id, { approverRoleKey: ROLE_KEYS.PURCHASING_MANAGER, enforceSegregation: true });
      const res = await actOnApproval(tx, { instanceId, userId: approver.id, userRoleKeys: [ROLE_KEYS.PURCHASING_MANAGER], documentCreatorId: creator.id, action: "APPROVE" });
      return res;
    });
    expect(outcome.documentDecision).toBe("APPROVED");
  });

  it("vekâlet: devredilen kullanıcı asıl onaycı adına onaylar", async () => {
    const outcome = await inRollback(async (tx) => {
      const tenant = await tx.tenant.findFirst();
      const creator = await tx.user.create({ data: { tenantId: tenant!.id, email: "c3@test.local", name: "C3" } });
      const realApprover = await tx.user.create({ data: { tenantId: tenant!.id, email: "real@test.local", name: "Real" } });
      const deputy = await tx.user.create({ data: { tenantId: tenant!.id, email: "deputy@test.local", name: "Deputy" } });
      // Aktif vekâlet: realApprover -> deputy
      await tx.delegation.create({ data: { fromUserId: realApprover.id, toUserId: deputy.id, startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 3600_000), isActive: true } });
      const instanceId = await seedInstance(tx, creator.id, { approverUserId: realApprover.id, enforceSegregation: true });
      const res = await actOnApproval(tx, { instanceId, userId: deputy.id, userRoleKeys: [], documentCreatorId: creator.id, action: "APPROVE" });
      return res;
    });
    expect(outcome.documentDecision).toBe("APPROVED");
  });

  it("yetkisiz kullanıcı onaylayamaz", async () => {
    const outcome = await inRollback(async (tx) => {
      const tenant = await tx.tenant.findFirst();
      const creator = await tx.user.create({ data: { tenantId: tenant!.id, email: "c4@test.local", name: "C4" } });
      const outsider = await tx.user.create({ data: { tenantId: tenant!.id, email: "out@test.local", name: "Out" } });
      const instanceId = await seedInstance(tx, creator.id, { approverRoleKey: ROLE_KEYS.PURCHASING_MANAGER });
      let denied = false;
      try {
        await actOnApproval(tx, { instanceId, userId: outsider.id, userRoleKeys: [ROLE_KEYS.REQUESTER], documentCreatorId: creator.id, action: "APPROVE" });
      } catch (e) {
        denied = e instanceof Error && e.message.includes("yetkiniz");
      }
      return { denied };
    });
    expect(outcome.denied).toBe(true);
  });
});

describe("iş kuralları — mükerrer fatura & tenant izolasyonu (gerçek DB, rollback)", () => {
  it("aynı tedarikçi+numara ile mükerrer fatura engellenir (unique)", async () => {
    const outcome = await inRollback(async (tx) => {
      const tenant = await tx.tenant.findFirst();
      const sup = await tx.supplier.create({ data: { tenantId: tenant!.id, code: "DUPSUP-" + Date.now(), legalName: "Dup Test" } });
      await tx.invoice.create({ data: { tenantId: tenant!.id, supplierId: sup.id, number: "DUP-001", invoiceDate: new Date() } });
      let blocked = false;
      try {
        await tx.invoice.create({ data: { tenantId: tenant!.id, supplierId: sup.id, number: "DUP-001", invoiceDate: new Date() } });
      } catch (e) {
        blocked = (e as { code?: string }).code === "P2002";
      }
      return { blocked };
    });
    expect(outcome.blocked).toBe(true);
  });

  it("tenant izolasyonu: sorgu tenant ile kapsanır", async () => {
    const outcome = await inRollback(async (tx) => {
      const t1 = await tx.tenant.findFirst();
      const t2 = await tx.tenant.create({ data: { name: "T2", slug: "t2-" + Date.now() } });
      await tx.supplier.create({ data: { tenantId: t2.id, code: "T2SUP", legalName: "T2 Only" } });
      const t1Suppliers = await tx.supplier.findMany({ where: { tenantId: t1!.id } });
      return { leaked: t1Suppliers.some((s) => s.legalName === "T2 Only") };
    });
    expect(outcome.leaked).toBe(false);
  });
});
