import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { translator, type Locale } from "@/lib/i18n";
import { BudgetForm } from "../../budget-form";

export const metadata = { title: "Bütçe Düzenle" };

export default async function EditBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.BUDGET_MANAGE);
  const T = translator(user.locale as Locale);
  const [b, companies, costCenters, projects, categories, currencies] = await Promise.all([
    prisma.budget.findFirst({ where: { id, tenantId: user.tenantId } }),
    prisma.company.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true } }),
    prisma.costCenter.findMany({ where: { company: { tenantId: user.tenantId } }, select: { id: true, name: true, companyId: true } }),
    prisma.project.findMany({ where: { company: { tenantId: user.tenantId } }, select: { id: true, name: true, companyId: true } }),
    prisma.category.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true } }),
    prisma.currency.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { code: true } }),
  ]);
  if (!b) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={T("bud.edit.title", { year: b.fiscalYear })} />
      <BudgetForm
        editMode companies={companies} costCenters={costCenters} projects={projects}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))} currencies={currencies.map((c) => c.code)}
        initial={{ id: b.id, companyId: b.companyId, costCenterId: b.costCenterId ?? "", projectId: b.projectId ?? "", categoryId: b.categoryId ?? "", fiscalYear: String(b.fiscalYear), period: b.period, currency: b.currency, plannedAmount: b.plannedAmount }}
      />
    </div>
  );
}
