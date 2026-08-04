import { SkeletonHeader, SkeletonKpis, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <SkeletonHeader />
      <SkeletonKpis />
      <div className="mt-8"><SkeletonCard lines={5} /></div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <SkeletonTable rows={5} />
        <SkeletonTable rows={5} />
      </div>
    </div>
  );
}
