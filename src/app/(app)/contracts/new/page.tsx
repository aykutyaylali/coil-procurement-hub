import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { ContractForm } from "../contract-form";

export const metadata: Metadata = { title: "Yeni Sözleşme" };

export default async function NewContractPage() {
  const user = await requirePermission(PERMISSIONS.CONTRACT_MANAGE);
  const [suppliers, currencies] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId: user.tenantId, deletedAt: null }, select: { id: true, legalName: true }, orderBy: { legalName: "asc" } }),
    prisma.currency.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { code: true }, orderBy: { code: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Yeni Sözleşme" description="Tedarikçi çerçeve sözleşmesi, limit, fiyat listesi ve SLA tanımlayın." />
      <ContractForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.legalName }))} currencies={currencies.map((c) => c.code)} />
    </div>
  );
}
