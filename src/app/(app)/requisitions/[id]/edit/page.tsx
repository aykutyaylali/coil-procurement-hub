import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { EditRequisitionForm, type EditInitial } from "../edit-form";

export const metadata: Metadata = { title: "Talep Düzelt" };

const EDITABLE = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ASSIGNED", "REJECTED"];

export default async function EditRequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const req = await prisma.purchaseRequisition.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: { lines: { orderBy: { lineNo: "asc" }, select: { description: true, quantity: true, uom: true, categoryId: true } } },
  });
  if (!req) notFound();

  const canEdit = req.requesterId === user.id || user.isSystemAdmin || userCan(user, PERMISSIONS.REQUISITION_EDIT);
  if (!canEdit || !EDITABLE.includes(req.status)) redirect(`/requisitions/${id}`);

  const [companies, departments, projects, costCenters, categories, uoms] = await Promise.all([
    prisma.company.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { company: { tenantId: user.tenantId } }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { company: { tenantId: user.tenantId }, isActive: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { company: { tenantId: user.tenantId }, isActive: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.unitOfMeasure.findMany({ where: { tenantId: user.tenantId, isActive: true }, orderBy: { code: "asc" } }),
  ]);

  const initial: EditInitial = {
    id: req.id,
    companyId: req.companyId,
    departmentId: req.departmentId ?? "",
    projectId: req.projectId ?? "",
    costCenterId: req.costCenterId ?? "",
    priority: req.priority,
    purchaseType: req.purchaseType,
    operationType: req.operationType,
    neededBy: req.neededBy ? req.neededBy.toISOString().slice(0, 10) : "",
    justification: req.justification ?? "",
    internalNote: req.internalNote ?? "",
    lines: req.lines.length
      ? req.lines.map((l) => ({ description: l.description, quantity: l.quantity, uom: l.uom ?? "", categoryId: l.categoryId ?? "" }))
      : [{ description: "", quantity: "1", uom: "", categoryId: "" }],
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={`Talep Düzelt — ${req.number}`} description="Genel bilgileri ve kalemleri güncelleyin." />
      <EditRequisitionForm
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, companyId: d.companyId }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name, companyId: p.companyId }))}
        costCenters={costCenters.map((c) => ({ id: c.id, name: c.name, companyId: c.companyId }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        uoms={uoms.map((u) => u.code)}
        initial={initial}
      />
    </div>
  );
}
