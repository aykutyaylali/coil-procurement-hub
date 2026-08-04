import type { Metadata } from "next";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { translator, type Locale } from "@/lib/i18n";
import { PageHeader } from "@/components/shell/page-header";
import { CustomerManager, type CustomerRow } from "./customer-manager";

export const metadata: Metadata = { title: "Müşteriler" };

export default async function CustomersPage() {
  const user = await requirePermission(PERMISSIONS.SALES_VIEW);
  const T = translator(user.locale as Locale);
  const canManage = userCan(user, PERMISSIONS.SALES_MANAGE);

  const [customers, salesReps] = await Promise.all([
    prisma.customer.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const repName = Object.fromEntries(salesReps.map((r) => [r.id, r.name] as const));
  const rows: CustomerRow[] = customers.map((c) => ({
    id: c.id, code: c.code, name: c.name, country: c.country, industry: c.industry,
    contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone,
    salesRepId: c.salesRepId, salesRepName: c.salesRepId ? repName[c.salesRepId] ?? null : null,
    defaultCurrency: c.defaultCurrency, notes: c.notes,
  }));

  return (
    <div>
      <PageHeader title={T("salesCust.title")} description={T("salesCust.description")} />
      <CustomerManager customers={rows} salesReps={salesReps} canManage={canManage} />
    </div>
  );
}
