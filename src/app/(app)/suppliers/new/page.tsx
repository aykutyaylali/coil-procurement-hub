import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { SupplierForm } from "../supplier-form";
import { translator, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Yeni Tedarikçi" };

export default async function NewSupplierPage() {
  const user = await requirePermission(PERMISSIONS.SUPPLIER_CREATE);
  const T = translator(user.locale as Locale);
  const currencies = await prisma.currency.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    select: { code: true },
    orderBy: { code: "asc" },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={T("supp.new")} description={T("supp.new.description")} />
      <SupplierForm currencies={currencies.map((c) => c.code)} />
    </div>
  );
}
