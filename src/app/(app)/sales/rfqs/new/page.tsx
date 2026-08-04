import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import Link from "next/link";
import { SalesRfqForm } from "../rfq-form";

export const metadata: Metadata = { title: "Yeni Müşteri Talebi" };

export default async function NewSalesRfqPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const user = await requirePermission(PERMISSIONS.SALES_MANAGE);
  const sp = await searchParams;
  const [customers, salesReps] = await Promise.all([
    prisma.customer.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Yeni Müşteri Talebi" description="Sales RFQ — müşteri talebi kaydı." />
      {customers.length === 0 ? (
        <Card><EmptyState title="Önce müşteri ekleyin" hint="Müşteri talebi için en az bir müşteri gerekir." /><div className="p-4"><Link href="/sales/customers" className="text-sm text-primary hover:underline">→ Müşteriler</Link></div></Card>
      ) : (
        <SalesRfqForm customers={customers} salesReps={salesReps} initial={sp.customerId ? { customerId: sp.customerId } : undefined} />
      )}
    </div>
  );
}
