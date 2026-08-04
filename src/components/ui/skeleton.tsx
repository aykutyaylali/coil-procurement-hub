import { cn } from "@/lib/utils";

/** Tekil iskelet bloğu — animate-pulse ile "yükleniyor" hissi. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/70", className)} />;
}

/** Sayfa başlığı iskeleti (PageHeader'a uyumlu). */
export function SkeletonHeader() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

/** KPI kart satırı iskeleti — yeni rounded-2xl / gölgeli kart estetiğine uyumlu. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card p-6 shadow-sm dark:ring-1 dark:ring-white/10">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Tablo kartı iskeleti. */
export function SkeletonTable({ rows = 8, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-card shadow-sm dark:ring-1 dark:ring-white/10", className)}>
      <div className="border-b border-border/60 px-4 py-3.5"><Skeleton className="h-4 w-40" /></div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border/40 px-4 py-3.5 last:border-0">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Genel amaçlı kart iskeleti (grafik/panel yer tutucusu). */
export function SkeletonCard({ className = "", lines = 4 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("rounded-2xl bg-card p-6 shadow-sm dark:ring-1 dark:ring-white/10", className)}>
      <Skeleton className="h-5 w-48" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
