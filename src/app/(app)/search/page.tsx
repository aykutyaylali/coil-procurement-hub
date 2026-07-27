import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Arama" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const empty = { reqs: [], rfqs: [], orders: [], suppliers: [] } as const;
  const [reqs, rfqs, orders, suppliers] = query
    ? await Promise.all([
        prisma.purchaseRequisition.findMany({ where: { tenantId: user.tenantId, number: { contains: query } }, take: 10 }),
        prisma.rFQ.findMany({ where: { tenantId: user.tenantId, OR: [{ number: { contains: query } }, { title: { contains: query } }] }, take: 10 }),
        prisma.purchaseOrder.findMany({ where: { tenantId: user.tenantId, number: { contains: query } }, take: 10 }),
        prisma.supplier.findMany({ where: { tenantId: user.tenantId, OR: [{ legalName: { contains: query } }, { code: { contains: query } }] }, take: 10 }),
      ])
    : [empty.reqs, empty.rfqs, empty.orders, empty.suppliers];

  const totalCount = reqs.length + rfqs.length + orders.length + suppliers.length;

  return (
    <div>
      <PageHeader title="Arama Sonuçları" description={query ? `"${query}" için ${totalCount} sonuç` : "Arama terimi girin."} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ResultCard title="Talepler" items={reqs.map((r) => ({ href: `/requisitions/${r.id}`, label: r.number, status: r.status }))} />
        <ResultCard title="Teklif Talepleri" items={rfqs.map((r) => ({ href: `/rfqs/${r.id}`, label: `${r.number} · ${r.title}`, status: r.status }))} />
        <ResultCard title="Siparişler" items={orders.map((o) => ({ href: `/orders/${o.id}`, label: o.number, status: o.status }))} />
        <ResultCard title="Tedarikçiler" items={suppliers.map((s) => ({ href: `/suppliers/${s.id}`, label: s.legalName, status: s.status }))} />
      </div>
    </div>
  );
}

function ResultCard({ title, items }: { title: string; items: { href: string; label: string; status: string }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title} ({items.length})</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {items.length === 0 && <p className="text-sm text-muted-foreground">Sonuç yok</p>}
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-accent">
            <span className="truncate text-sm">{i.label}</span>
            <StatusBadge status={i.status} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
