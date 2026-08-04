import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { translator, type Locale } from "@/lib/i18n";
import { ContractForm } from "../../contract-form";

export const metadata = { title: "Sözleşme Düzenle" };

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.CONTRACT_MANAGE);
  const T = translator(user.locale as Locale);
  const [c, suppliers, currencies] = await Promise.all([
    prisma.contract.findFirst({ where: { id, tenantId: user.tenantId } }),
    prisma.supplier.findMany({ where: { tenantId: user.tenantId, deletedAt: null }, select: { id: true, legalName: true }, orderBy: { legalName: "asc" } }),
    prisma.currency.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { code: true } }),
  ]);
  if (!c) notFound();
  const iso = (dt: Date | null) => (dt ? dt.toISOString().slice(0, 10) : "");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={T("con.editTitle", { code: c.code })} />
      <ContractForm
        editMode
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.legalName }))}
        currencies={currencies.map((x) => x.code)}
        initial={{
          id: c.id, supplierId: c.supplierId, title: c.title, type: c.type,
          startDate: iso(c.startDate), endDate: iso(c.endDate), autoRenew: c.autoRenew,
          noticeDate: iso(c.noticeDate), currency: c.currency, totalLimit: c.totalLimit ?? "", slaTerms: c.slaTerms ?? "",
        }}
      />
    </div>
  );
}
