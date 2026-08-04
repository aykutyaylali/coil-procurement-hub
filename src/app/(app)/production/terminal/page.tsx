import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { translator, type Locale } from "@/lib/i18n";
import { PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TerminalKiosk } from "./terminal-kiosk";
import { getActiveStations } from "../data";

export const metadata: Metadata = { title: "Saha Terminali" };

export default async function TerminalPage() {
  const user = await requirePermission(PERMISSIONS.PRODUCTION_OPERATE);
  const T = translator(user.locale as Locale);
  const stations = await getActiveStations(user.tenantId);

  return (
    <div>
      <PageHeader title={T("prodTerm.title")} description={T("prodTerm.pageDescription")} />
      {stations.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {T("prodTerm.emptyBefore")} <code className="rounded bg-muted px-1">npm run db:seed:production</code> {T("prodTerm.emptyMiddle")}{" "}
          <Link href="/production/work-orders" className="text-primary hover:underline">{T("prodTerm.emptyWorkOrdersLink")}</Link> {T("prodTerm.emptyAfter")}
        </CardContent></Card>
      ) : (
        <TerminalKiosk stations={stations} />
      )}
    </div>
  );
}
