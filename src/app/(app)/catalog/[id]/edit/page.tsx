import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { ItemForm } from "../../item-form";

export const metadata = { title: "Ürün Düzenle" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
  const [item, categories, uoms, suppliers] = await Promise.all([
    prisma.item.findFirst({ where: { id, tenantId: user.tenantId } }),
    prisma.category.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.unitOfMeasure.findMany({ where: { tenantId: user.tenantId }, select: { id: true, code: true } }),
    prisma.supplier.findMany({ where: { tenantId: user.tenantId, deletedAt: null }, select: { id: true, legalName: true }, orderBy: { legalName: "asc" }, take: 300 }),
  ]);
  if (!item) notFound();
  let preferredSuppliers: string[] = [];
  try { preferredSuppliers = item.preferredSuppliers ? JSON.parse(item.preferredSuppliers) : []; } catch { /* */ }
  let unitConversions: { fromUom: string; toUom: string; factor: string }[] = [];
  try { unitConversions = item.unitConversions ? JSON.parse(item.unitConversions) : []; } catch { /* */ }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Ürün Düzenle · ${item.code}`} />
      <ItemForm
        editMode categories={categories} uoms={uoms} suppliers={suppliers.map((s) => ({ id: s.id, name: s.legalName }))}
        initial={{
          id: item.id, code: item.code, name: item.name, description: item.description ?? "", categoryId: item.categoryId ?? "",
          brand: item.brand ?? "", manufacturer: item.manufacturer ?? "", manufacturerCode: item.manufacturerCode ?? "",
          gtipCode: item.gtipCode ?? "", baseUomId: item.baseUomId ?? "", minOrderQty: item.minOrderQty ?? "",
          leadTimeDays: item.leadTimeDays ? String(item.leadTimeDays) : "", specs: item.specs ?? "",
          isService: item.isService, isActive: item.isActive, preferredSuppliers, unitConversions,
          pricingType: item.pricingType ?? "FIXED", lmeCoefficient: item.lmeCoefficient ?? "1.0000",
          defaultPremiumUsdPerKg: item.defaultPremiumUsdPerKg ?? "", defaultExtraCostUsdPerKg: item.defaultExtraCostUsdPerKg ?? "",
          pricingNote: item.pricingNote ?? "",
        }}
      />
    </div>
  );
}
