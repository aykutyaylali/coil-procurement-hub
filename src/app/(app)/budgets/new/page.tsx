import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { translator, type Locale } from "@/lib/i18n";
import { BudgetForm } from "../budget-form";

export const metadata: Metadata = { title: "Yeni Bütçe" };

export default async function NewBudgetPage() {
  const user = await requirePermission(PERMISSIONS.BUDGET_MANAGE);
  const T = translator(user.locale as Locale);
  const [companies, costCenters, projects, categories, currencies] = await Promise.all([
    prisma.company.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true } }),
    prisma.costCenter.findMany({ where: { company: { tenantId: user.tenantId } }, select: { id: true, name: true, companyId: true } }),
    prisma.project.findMany({ where: { company: { tenantId: user.tenantId } }, select: { id: true, name: true, companyId: true } }),
    prisma.category.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.currency.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { code: true } }),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={T("bud.new")} description={T("bud.new.desc")} />
      <BudgetForm
        companies={companies} costCenters={costCenters} projects={projects}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))} currencies={currencies.map((c) => c.code)}
      />
    </div>
  );
}
