import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS_TR, type RoleKey } from "@/lib/rbac";
import { updateLocale } from "./actions";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const full = await prisma.user.findUnique({
    where: { id: user.id },
    include: { userRoles: { include: { role: true } }, department: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profilim" description="Hesap bilgileriniz ve tercihleriniz." />
      <Card>
        <CardHeader><CardTitle>{full?.name}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="E-posta" value={full?.email ?? ""} />
          <Row label="Ünvan" value={full?.title ?? "-"} />
          <Row label="Departman" value={full?.department?.name ?? "-"} />
          <Row label="Roller" value={(full?.userRoles ?? []).map((ur) => ROLE_LABELS_TR[ur.role.key as RoleKey] ?? ur.role.key).join(", ")} />
          <Row label="Saat Dilimi" value={full?.timezone ?? "-"} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Dil Tercihi</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Arayüz dilini seçin. Tercih hesabınızda saklanır ve tüm oturumlarda uygulanır.
          </p>
          <div className="flex gap-2">
            <form action={updateLocale.bind(null, "tr")}>
              <Button type="submit" variant={user.locale === "tr" ? "default" : "outline"}>Türkçe</Button>
            </form>
            <form action={updateLocale.bind(null, "en")}>
              <Button type="submit" variant={user.locale === "en" ? "default" : "outline"}>English</Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
