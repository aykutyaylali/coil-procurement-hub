import Link from "next/link";

export const DEFAULT_PAGE_SIZE = 25;

/** searchParams içindeki `page`'i güvenli 1-tabanlı tam sayıya çevirir. */
export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Prisma skip/take hesaplar. */
export function pageArgs(page: number, size = DEFAULT_PAGE_SIZE) {
  return { skip: (page - 1) * size, take: size };
}

/**
 * Sunucu tarafı sayfalama çubuğu. Mevcut sorgu parametrelerini korur,
 * yalnızca `page`'i değiştirir.
 */
export function Pagination({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  total,
  basePath,
  query = {},
}: {
  page: number;
  pageSize?: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Sayfalama">
      <span className="text-muted-foreground">
        {from}–{to} / {total} kayıt
      </span>
      <div className="flex items-center gap-1">
        <PageLink disabled={page <= 1} href={href(page - 1)} label="‹ Önceki" />
        <span className="px-2 text-muted-foreground">
          Sayfa {page} / {pageCount}
        </span>
        <PageLink disabled={page >= pageCount} href={href(page + 1)} label="Sonraki ›" />
      </div>
    </nav>
  );
}

function PageLink({ disabled, href, label }: { disabled: boolean; href: string; label: string }) {
  if (disabled) {
    return <span className="cursor-not-allowed rounded-md border px-3 py-1 text-muted-foreground opacity-50">{label}</span>;
  }
  return (
    <Link href={href} prefetch className="rounded-md border px-3 py-1 hover:bg-accent">
      {label}
    </Link>
  );
}
