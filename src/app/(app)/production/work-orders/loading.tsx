import { SkeletonHeader, SkeletonKpis, SkeletonTable, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Yükleniyor">
      <SkeletonHeader />
      <SkeletonKpis />
      <div className="mt-4 rounded-2xl bg-card p-4 shadow-sm dark:ring-1 dark:ring-white/10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
        </div>
      </div>
      <div className="mt-4"><SkeletonTable rows={8} /></div>
    </div>
  );
}
