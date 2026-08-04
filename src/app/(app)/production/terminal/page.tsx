import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TerminalKiosk } from "./terminal-kiosk";
import { getActiveStations } from "../data";

export const metadata: Metadata = { title: "Saha Terminali" };

export default async function TerminalPage() {
  const user = await requirePermission(PERMISSIONS.PRODUCTION_OPERATE);
  const stations = await getActiveStations(user.tenantId);

  return (
    <div>
      <PageHeader title="Saha Terminali" description="Barkod okuyucu / dokunmatik kiosk — operatör ve iş emri okutarak üretim kaydı girin." />
      {stations.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Henüz üretim istasyonu tanımlı değil. Demo veri için <code className="rounded bg-muted px-1">npm run db:seed:production</code> çalıştırın veya{" "}
          <Link href="/production/work-orders" className="text-primary hover:underline">iş emirleri</Link> bölümünü kullanın.
        </CardContent></Card>
      ) : (
        <TerminalKiosk stations={stations} />
      )}
    </div>
  );
}
