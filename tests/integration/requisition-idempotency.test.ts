import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Idempotency (çift tıklama) + tenant izolasyonu — perf/select değişiklikleri sonrası (Senaryo 8, 12).
 * Gerçek DB, rollback transaction.
 */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await prisma.$transaction(async (tx) => { result = await fn(tx); throw new Error("__ROLLBACK__"); });
  } catch (e) { if (!(e instanceof Error) || e.message !== "__ROLLBACK__") throw e; }
  return result;
}
afterAll(async () => { await prisma.$disconnect(); });

describe("talep idempotency (çift tıklama korumasi)", () => {
  it("8) aynı clientRequestId ile ikinci talep oluşmaz (unique kısıt)", async () => {
    const outcome = await inRollback(async (tx) => {
      const tenant = await tx.tenant.findFirst();
      const company = await tx.company.findFirst({ where: { tenantId: tenant!.id } });
      const requester = await tx.user.findFirst({ where: { tenantId: tenant!.id } });
      const crid = "idem-" + Math.random().toString(36).slice(2);

      const base = {
        tenantId: tenant!.id, companyId: company!.id, requesterId: requester!.id,
        status: "DRAFT", currency: "TRY", estimatedTotal: "0", clientRequestId: crid,
      };
      await tx.purchaseRequisition.create({ data: { ...base, number: "IDEM-1-" + Date.now() } });

      let secondFailed = false;
      try {
        await tx.purchaseRequisition.create({ data: { ...base, number: "IDEM-2-" + Date.now() } });
      } catch (e) {
        secondFailed = true;
        expect((e as { code?: string }).code).toBe("P2002");
      }
      const count = await tx.purchaseRequisition.count({ where: { tenantId: tenant!.id, clientRequestId: crid } });
      return { secondFailed, count };
    });
    expect(outcome.secondFailed).toBe(true);
    expect(outcome.count).toBe(1);
  });
});

describe("tenant izolasyonu (liste select sorgusu)", () => {
  it("12) tenantId filtreli liste sorgusu yalnızca kendi tenant'ının kayıtlarını döndürür", async () => {
    const ok = await inRollback(async (tx) => {
      const tA = await tx.tenant.create({ data: { name: "T-A", slug: "t-a-" + Date.now() } });
      const tB = await tx.tenant.create({ data: { name: "T-B", slug: "t-b-" + Date.now() } });
      const cA = await tx.company.create({ data: { tenantId: tA.id, code: "CA", name: "CoA" } });
      const cB = await tx.company.create({ data: { tenantId: tB.id, code: "CB", name: "CoB" } });
      const uA = await tx.user.create({ data: { tenantId: tA.id, email: "a@x.com", name: "A" } });
      const uB = await tx.user.create({ data: { tenantId: tB.id, email: "b@x.com", name: "B" } });
      await tx.purchaseRequisition.create({ data: { tenantId: tA.id, companyId: cA.id, requesterId: uA.id, number: "A-1", status: "DRAFT", currency: "TRY", estimatedTotal: "0" } });
      await tx.purchaseRequisition.create({ data: { tenantId: tB.id, companyId: cB.id, requesterId: uB.id, number: "B-1", status: "DRAFT", currency: "TRY", estimatedTotal: "0" } });

      // Liste sayfasının yaptığı gibi: sadece tenantId=A, select minimal
      const rows = await tx.purchaseRequisition.findMany({
        where: { tenantId: tA.id },
        select: { number: true, company: { select: { name: true } }, requester: { select: { name: true } } },
      });
      return rows.every((r) => r.number.startsWith("A")) && rows.length === 1;
    });
    expect(ok).toBe(true);
  });
});
