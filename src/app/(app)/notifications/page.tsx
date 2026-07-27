import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { markAllRead } from "./actions";

export const metadata: Metadata = { title: "Bildirimler" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Bildirimler" />
        <form action={markAllRead}>
          <Button type="submit" variant="outline" size="sm">Tümünü okundu işaretle</Button>
        </form>
      </div>
      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState title="Bildirim yok" />
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link ?? "#"}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-accent ${n.isRead ? "opacity-60" : ""}`}
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.isRead ? "bg-muted-foreground/30" : "bg-primary"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{n.title}</div>
                    {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
