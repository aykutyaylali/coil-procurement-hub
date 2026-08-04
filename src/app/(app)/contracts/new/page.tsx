import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { translator, type Locale } from "@/lib/i18n";
import { ContractForm } from "../contract-form";

export const metadata: Metadata = { title: "Yeni Sözleşme" };

export default async function NewContractPage() {
  const user = await requirePermission(PERMISSIONS.CONTRACT_MANAGE);
  const T = translator(user.locale as Locale);
  const [suppliers, currencies] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId: user.tenantId, deletedAt: null }, select: { id: true, legalName: true }, orderBy: { legalName: "asc" } }),
    prisma.currency.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { code: true }, orderBy: { code: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={T("con.new")} description={T("con.new.desc")} />
      <ContractForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.legalName }))} currencies={currencies.map((c) => c.code)} />
    </div>
  );
}
