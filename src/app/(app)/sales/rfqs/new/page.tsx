import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { translator, type Locale } from "@/lib/i18n";
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
  const T = translator(user.locale as Locale);
  const sp = await searchParams;
  const [customers, salesReps] = await Promise.all([
    prisma.customer.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={T("salesRfq.new.title")} description={T("salesRfq.new.description")} />
      {customers.length === 0 ? (
        <Card><EmptyState title={T("salesRfq.new.noCustomerTitle")} hint={T("salesRfq.new.noCustomerHint")} /><div className="p-4"><Link href="/sales/customers" className="text-sm text-primary hover:underline">→ {T("salesRfq.new.customersLink")}</Link></div></Card>
      ) : (
        <SalesRfqForm customers={customers} salesReps={salesReps} initial={sp.customerId ? { customerId: sp.customerId } : undefined} />
      )}
    </div>
  );
}
