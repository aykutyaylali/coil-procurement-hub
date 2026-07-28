/**
 * Uygulama geneli anında yükleme iskeleti. Sayfa geçişlerinde sunucu verisi
 * hazırlanırken (Suspense) hemen gösterilir; ekranın donmasını engeller.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Yükleniyor">
      <div className="space-y-2">
        <div className="h-7 w-64 rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border bg-muted/40" />
        ))}
      </div>
      <div className="rounded-lg border">
        <div className="h-11 border-b bg-muted/40" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 flex-1 rounded bg-muted/60" />
            <div className="h-4 w-20 rounded bg-muted/60" />
            <div className="h-4 w-16 rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
