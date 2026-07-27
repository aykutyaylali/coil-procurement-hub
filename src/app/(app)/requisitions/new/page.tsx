import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { NewRequisitionForm } from "./new-form";

export const metadata: Metadata = { title: "Yeni Talep" };

export default async function NewRequisitionPage() {
  const user = await requirePermission(PERMISSIONS.REQUISITION_CREATE);

  const [companies, departments, projects, costCenters, categories, currencies, uoms] =
    await Promise.all([
      prisma.company.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { name: "asc" } }),
      prisma.department.findMany({ where: { company: { tenantId: user.tenantId } }, orderBy: { name: "asc" } }),
      prisma.project.findMany({ where: { company: { tenantId: user.tenantId }, isActive: true }, orderBy: { name: "asc" } }),
      prisma.costCenter.findMany({ where: { company: { tenantId: user.tenantId }, isActive: true }, orderBy: { name: "asc" } }),
      prisma.category.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { name: "asc" } }),
      prisma.currency.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { code: "asc" } }),
      prisma.unitOfMeasure.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { code: "asc" } }),
    ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Yeni Satınalma Talebi" description="İhtiyacınızı tanımlayın; onay sonrası satınalmaya iletilir." />
      <NewRequisitionForm
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, companyId: d.companyId }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name, companyId: p.companyId }))}
        costCenters={costCenters.map((c) => ({ id: c.id, name: c.name, companyId: c.companyId }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        currencies={currencies.map((c) => c.code)}
        uoms={uoms.map((u) => u.code)}
      />
    </div>
  );
}
