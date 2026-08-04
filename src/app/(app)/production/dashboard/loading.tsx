import { SkeletonHeader, SkeletonKpis, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Yükleniyor">
      <SkeletonHeader />
      <SkeletonKpis />
      <div className="mt-8"><SkeletonCard lines={4} /></div>
      <div className="mt-8"><SkeletonTable rows={6} /></div>
      <div className="mt-8"><SkeletonTable rows={5} /></div>
    </div>
  );
}
