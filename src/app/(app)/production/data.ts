import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * Üretim istasyonları — nadiren değişen master veri. Next.js veri önbelleği
 * (unstable_cache) ile tenant başına cache'lenir; her istekte tekrar sorgulanmaz.
 * Panel/terminal/iş-emri detay sayfaları paylaşır. 1 saat sonra yenilenir;
 * seed/CRUD sonrası `revalidateTag("stations-<tenantId>")` ile boşaltılabilir.
 */
export function getActiveStations(tenantId: string) {
  return unstable_cache(
    () =>
      prisma.productionStation.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sequence: "asc" },
        select: { id: true, code: true, name: true, sequence: true },
      }),
    ["production-stations", tenantId],
    { revalidate: 3600, tags: [`stations-${tenantId}`] },
  )();
}
