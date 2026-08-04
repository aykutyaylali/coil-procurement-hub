import { SkeletonHeader, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Yükleniyor">
      <SkeletonHeader />
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl bg-card p-5 shadow-sm dark:ring-1 dark:ring-white/10"><Skeleton className="h-14 w-full" /></div>
        <div className="flex items-center justify-between gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 flex-1" />)}
        </div>
        <div className="rounded-2xl bg-card p-8 shadow-sm dark:ring-1 dark:ring-white/10">
          <Skeleton className="mx-auto h-6 w-72" />
          <Skeleton className="mx-auto mt-4 h-20 w-full max-w-lg" />
          <Skeleton className="mx-auto mt-5 h-14 w-40" />
        </div>
      </div>
    </div>
  );
}
