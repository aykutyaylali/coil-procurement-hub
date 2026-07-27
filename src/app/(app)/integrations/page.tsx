import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Entegrasyonlar" };

const CONNECTORS = [
  { key: "SAP", desc: "SAP ERP (ürün, tedarikçi, sipariş, fatura)" },
  { key: "LOGO", desc: "Logo Tiger/Go" },
  { key: "NETSIS", desc: "Netsis" },
  { key: "TCMB", desc: "TCMB döviz kurları" },
  { key: "EINVOICE", desc: "e-Fatura / e-Arşiv" },
  { key: "CSV", desc: "CSV/Excel içe-dışa aktarma" },
];

export default async function IntegrationsPage() {
  const user = await requirePermission(PERMISSIONS.ADMIN_INTEGRATIONS);
  const jobs = await prisma.integrationJob.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <PageHeader title="Entegrasyon Merkezi" description="Adapter tabanlı entegrasyonlar. İşlemler idempotent çalışır; hata/yeniden deneme burada izlenir." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CONNECTORS.map((c) => (
          <Card key={c.key}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{c.key}</div>
                <div className="text-xs text-muted-foreground">{c.desc}</div>
              </div>
              <Badge tone={c.key === "TCMB" && env.EXCHANGE_RATE_PROVIDER === "tcmb" ? "success" : "default"}>
                {c.key === "TCMB" ? env.EXCHANGE_RATE_PROVIDER.toUpperCase() : "Adapter Hazır"}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Son Entegrasyon İşleri</CardTitle></CardHeader>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <EmptyState title="İş kaydı yok" hint="Entegrasyon çalıştığında işler burada loglanır." />
          ) : (
            <Table>
              <THead><TR><TH>Konnektör</TH><TH>İşlem</TH><TH>Yön</TH><TH>Durum</TH><TH>Tarih</TH></TR></THead>
              <TBody>
                {jobs.map((j) => (
                  <TR key={j.id}>
                    <TD className="font-medium">{j.connector}</TD>
                    <TD className="text-sm">{j.operation}</TD>
                    <TD className="text-sm">{j.direction}</TD>
                    <TD><StatusBadge status={j.status} /></TD>
                    <TD className="text-sm text-muted-foreground">{formatDateTime(j.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
