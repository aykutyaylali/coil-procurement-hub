import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Ayarlar" };

export default async function SettingsPage() {
  const user = await requirePermission(PERMISSIONS.ADMIN_SETTINGS);
  const [companies, currencies, taxCodes, workflows, uoms] = await Promise.all([
    prisma.company.findMany({ where: { tenantId: user.tenantId } }),
    prisma.currency.findMany({ where: { tenantId: user.tenantId } }),
    prisma.taxCode.findMany({ where: { tenantId: user.tenantId } }),
    prisma.approvalWorkflow.findMany({ where: { tenantId: user.tenantId }, include: { _count: { select: { rules: true } } } }),
    prisma.unitOfMeasure.findMany({ where: { tenantId: user.tenantId } }),
  ]);

  return (
    <div>
      <PageHeader title="Sistem Ayarları" description="Şirket, para birimi, vergi, onay akışları ve genel yapılandırma. Kritik değişiklikler denetim kaydına yazılır." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Şirketler</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table><THead><TR><TH>Kod</TH><TH>Ad</TH><TH>Para</TH></TR></THead>
              <TBody>{companies.map((c) => <TR key={c.id}><TD>{c.code}</TD><TD>{c.name}</TD><TD>{c.baseCurrency}</TD></TR>)}</TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Onay Akışları</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table><THead><TR><TH>Ad</TH><TH>Belge Türü</TH><TH className="text-center">Kural</TH></TR></THead>
              <TBody>{workflows.map((w) => <TR key={w.id}><TD>{w.name}</TD><TD className="text-sm">{w.documentType}</TD><TD className="text-center">{w._count.rules}</TD></TR>)}</TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Vergi Kodları (KDV / Tevkifat)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table><THead><TR><TH>Kod</TH><TH>Ad</TH><TH>Tür</TH><TH className="text-right">Oran</TH></TR></THead>
              <TBody>{taxCodes.map((t) => <TR key={t.id}><TD>{t.code}</TD><TD>{t.name}</TD><TD className="text-sm">{t.kind}</TD><TD className="text-right">%{t.rate}</TD></TR>)}</TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Para Birimleri & Birimler</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">PARA BİRİMLERİ</div>
              <div className="flex flex-wrap gap-2">{currencies.map((c) => <span key={c.id} className="rounded bg-secondary px-2 py-1 text-xs">{c.code}</span>)}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">ÖLÇÜ BİRİMLERİ</div>
              <div className="flex flex-wrap gap-2">{uoms.map((u) => <span key={u.id} className="rounded bg-secondary px-2 py-1 text-xs">{u.code}</span>)}</div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Ortam Yapılandırması (salt-okunur)</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Info label="E-posta Sağlayıcı" value={env.EMAIL_PROVIDER} />
          <Info label="Depolama" value={env.STORAGE_PROVIDER} />
          <Info label="Döviz Kaynağı" value={env.EXCHANGE_RATE_PROVIDER} />
          <Info label="Varsayılan Dil" value={env.DEFAULT_LOCALE} />
          <Info label="Saat Dilimi" value={env.DEFAULT_TIMEZONE} />
          <Info label="AI Özelliği" value={env.FEATURE_AI ? "Açık" : "Kapalı"} />
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
