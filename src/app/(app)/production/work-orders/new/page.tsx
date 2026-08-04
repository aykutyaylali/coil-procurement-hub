import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { WorkOrderForm } from "../wo-form";

export const metadata: Metadata = { title: "Yeni İş Emri" };

export default async function NewWorkOrderPage() {
  const user = await requirePermission(PERMISSIONS.PRODUCTION_MANAGE);
  const customers = await prisma.customer.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader title="Yeni İş Emri" description="Üretilecek bobin partisi için iş emri oluşturun." />
      <WorkOrderForm customers={customers} />
    </div>
  );
}
