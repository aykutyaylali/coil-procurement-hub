import Link from "next/link";
import { requireUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { translator, type Locale } from "@/lib/i18n";
import { markAllRead } from "@/app/(app)/notifications/actions";

export const metadata = { title: "Bildirimler / Notifications" };

export default async function PortalNotificationsPage() {
  const user = await requireUser();
  const T = translator(user.locale as Locale);
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{T("portal.notifications")}</h1>
        <form action={markAllRead}>
          <Button type="submit" variant="outline" size="sm">{T("portal.markAllRead")}</Button>
        </form>
      </div>
      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState title={T("portal.noNotif")} />
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <Link key={n.id} href={n.link ?? "#"} className={`flex items-start gap-3 px-4 py-3 hover:bg-accent ${n.isRead ? "opacity-60" : ""}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.isRead ? "bg-muted-foreground/30" : "bg-primary"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{n.title}</div>
                    {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                    <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
