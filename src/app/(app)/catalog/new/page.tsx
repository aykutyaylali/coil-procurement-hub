import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { ItemForm } from "../item-form";

export const metadata: Metadata = { title: "Yeni Ürün" };

export default async function NewItemPage() {
  const user = await requirePermission(PERMISSIONS.CATALOG_MANAGE);
  const [categories, uoms, suppliers] = await Promise.all([
    prisma.category.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.unitOfMeasure.findMany({ where: { tenantId: user.tenantId }, select: { id: true, code: true } }),
    prisma.supplier.findMany({ where: { tenantId: user.tenantId, deletedAt: null }, select: { id: true, legalName: true }, orderBy: { legalName: "asc" }, take: 300 }),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Yeni Ürün / Hizmet" description="Merkezi katalog kartı: kod, kategori, marka, birim, tercih tedarikçi, birim dönüşümü." />
      <ItemForm categories={categories} uoms={uoms} suppliers={suppliers.map((s) => ({ id: s.id, name: s.legalName }))} />
    </div>
  );
}
