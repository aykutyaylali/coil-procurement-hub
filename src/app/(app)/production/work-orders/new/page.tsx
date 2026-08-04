import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { translator, type Locale } from "@/lib/i18n";
import { WorkOrderForm } from "../wo-form";

export const metadata: Metadata = { title: "Yeni İş Emri" };

export default async function NewWorkOrderPage() {
  const user = await requirePermission(PERMISSIONS.PRODUCTION_MANAGE);
  const T = translator(user.locale as Locale);
  const customers = await prisma.customer.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader title={T("prodWo.newWorkOrder")} description={T("prodWo.newDescription")} />
      <WorkOrderForm customers={customers} />
    </div>
  );
}
