import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { SupplierForm, type SupplierInitial } from "../../supplier-form";

export const metadata: Metadata = { title: "Tedarikçi Düzenle" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.SUPPLIER_EDIT);
  const s = await prisma.supplier.findFirst({ where: { id, tenantId: user.tenantId, deletedAt: null } });
  if (!s) notFound();

  const [currencies] = await Promise.all([
    prisma.currency.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { code: true }, orderBy: { code: "asc" } }),
  ]);

  let operationTypes: string[] = [];
  try { operationTypes = JSON.parse(s.operationTypes); } catch { /* */ }

  const initial: SupplierInitial = {
    id: s.id,
    legalName: s.legalName,
    shortName: s.shortName ?? "",
    supplierType: (s.supplierType as "DOMESTIC" | "FOREIGN") ?? "DOMESTIC",
    taxIdType: s.taxIdType ?? "VKN",
    taxOffice: s.taxOffice ?? "",
    taxNumber: s.taxNumber ?? "",
    country: s.country ?? "TR",
    addressLine: s.addressLine ?? "",
    city: s.city ?? "",
    stateRegion: s.stateRegion ?? "",
    postalCode: s.postalCode ?? "",
    website: s.website ?? "",
    preferredLanguage: (s.preferredLanguage as "tr" | "en") ?? "tr",
    defaultCurrency: s.defaultCurrency ?? "TRY",
    defaultIncoterm: s.defaultIncoterm ?? "",
    defaultPaymentTermDays: s.defaultPaymentTermDays != null ? String(s.defaultPaymentTermDays) : "",
    operationTypes,
    isManufacturer: s.isManufacturer,
    isDistributor: s.isDistributor,
    isExporter: s.isExporter,
    riskLevel: (s.riskLevel as "LOW" | "MEDIUM" | "HIGH") ?? "LOW",
    contactName: "", contactEmail: "", contactPhone: "",
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Düzenle — ${s.legalName}`} description={`Tedarikçi kodu: ${s.code}`} />
      <SupplierForm currencies={currencies.map((c) => c.code)} initial={initial} editMode />
    </div>
  );
}
