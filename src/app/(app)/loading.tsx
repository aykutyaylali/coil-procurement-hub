import { SkeletonHeader, SkeletonKpis, SkeletonTable } from "@/components/ui/skeleton";

/**
 * Uygulama geneli anında yükleme iskeleti. Sayfa geçişlerinde sunucu verisi
 * (Prisma) hazırlanırken Suspense fallback olarak hemen gösterilir; ekranın
 * donmasını engeller. Yeni rounded-2xl / gölgeli kart estetiğine uyumludur.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Yükleniyor">
      <SkeletonHeader />
      <SkeletonKpis />
      <div className="mt-8">
        <SkeletonTable rows={8} />
      </div>
    </div>
  );
}
