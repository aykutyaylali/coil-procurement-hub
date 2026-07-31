# Performans Raporu — Ölçüm ve Optimizasyon

> Ölçümler **production build** (`next build` + `next start`) üzerinde, gerçek tarayıcı (Chromium,
> Playwright) ile alınmıştır. `npm run dev` ilk-derleme süreleri ölçüm olarak KULLANILMAMIŞTIR.
> Her sayfa: 1 ısınma turu + ardından 3 ölçüm; medyan raporlanmıştır. Veritabanı: SQLite (dev.db),
> gerçek içe aktarılmış veri (494 sipariş, 135 tedarikçi, 16 talep).

## Yöntem

- Wall-clock: `page.goto(url, { waitUntil: "networkidle" })` süresi (sunucu yanıtı + tam render + tüm istekler).
- Satır/sorgu düzeyi değişiklikler kod incelemesi + gerçek satır sayımıyla ölçüldü.
- Ölçüm betiği: giriş (satınalma uzmanı) → 7 sayfa, her biri ısınma + 3 tur.

## Önce / Sonra (medyan, ms — production build)

| Sayfa | Önce | Sonra | Değişim |
|---|---:|---:|---:|
| dashboard | 689 | 656 | −33 (−5%) |
| talepler (liste) | 782 | 765 | −17 (−2%) |
| talep oluşturma | 566 | 569 | ~0 (form; liste sorgusu yok) |
| siparişler (liste) | 799 | 734 | −65 (−8%) |
| tedarikçiler (liste) | 812 | 742 | −70 (−9%) |
| raporlar | 797 | 701 | −96 (−12%) |
| sipariş detay | 687 | 662 | −25 (−4%) |

**Dürüst yorum:** Bu veri ölçeğinde (yüzlerce satır) wall-clock, SSR + render tabanıyla domine
oluyor (liste sorgusu olmayan "talep oluşturma" sayfası bile ~560 ms). Bu yüzden wall-clock kazanımı
ölçülü (%5–12). Asıl kazanımlar **güvenlik**, **veri transferi** ve **ölçeklenebilirliktedir** (aşağıda),
ve satır sayısı büyüdükçe (10K+ sipariş) etkileri doğrusal olarak büyür.

## Uygulanan optimizasyonlar (satır/sorgu düzeyi)

| Alan | Önce | Sonra | Etki |
|---|---|---|---|
| **Liste `include: true`** | `include: { requester: true }` tüm kullanıcı sütunlarını (**passwordHash, mfaSecret dahil**) çekiyordu | `select` ile yalnızca gerekli sütunlar | **Güvenlik: hassas alan sızıntısı giderildi** + daha az veri |
| **Sayfalama (siparişler)** | `take: 100` — 494 siparişin yalnızca 100'ü, gerisine erişilemiyordu | server-side pagination, 25/sayfa + `count` | Fonksiyonel düzeltme + sabit sayfa maliyeti |
| **Sayfalama (talepler/tedarikçiler)** | `take: 100 / 200` | 25/sayfa + `count` | Ölçekte sabit maliyet |
| **Dashboard toplam harcama** | tüm iptal-olmayan siparişleri (494) çekiyordu | `currency: "TRY"` filtresi + yalnızca `grandTotal` sütunu | Gereksiz sütun/satır azaltıldı (grandTotal decimal-as-string olduğu için DB-SUM mümkün değil) |
| **Bekleyen onaylar (per-nav)** | layout + dashboard'da **2×** çalışıyordu; `PENDING` taraması indekssiz | React `cache()` ile istek başına **1×** + `@@index([status])` | Dashboard'da sorgu tekrarı kaldırıldı |
| **DB indexleri** | — | `PurchaseOrder(tenantId,createdAt)`, `Supplier(tenantId,legalName)`, `PurchaseRequisition(tenantId,status,createdAt)`, `ApprovalInstance(status)` | Sıralama/filtre taramaları indexli (ölçekte kritik) |
| **Anında loading** | yok | `(app)/loading.tsx` iskeleti | Algılanan hız: geçişte anında iskelet, donma yok |

## Sorun OLMAYAN (ölçüldü, değiştirilmedi)

- **PrismaClient singleton** — `src/lib/db.ts` globalThis singleton; her istekte yeni client oluşturulmuyor. ✓
- **Middleware** — DB sorgusu yok; yalnızca in-memory rate limit + güvenlik başlıkları. ✓
- **Auth/session** — `getCurrentUser` React `cache()` ile sarılı; istek başına tek sorgu (layout + sayfa paylaşır). ✓
- **Ağır client kütüphaneleri** — PDF (pdfkit) yalnızca sunucu route handler'larında (client bundle'a dâhil değil); raporlar saf `BarList` (grafik kütüphanesi yok). Lazy-load gereksiz. ✓
- **N+1** — liste sayfaları `select` ile ilişkileri tek batch'te çeker; döngü içi sorgu yok.

## Ölçekte önemli (bu veri boyutunda görünmez ama büyümede kritik)

- Sayfalama olmadan `take: 100/200` büyümede lineer yavaşlar; pagination sabit maliyet sağlar.
- `select` yalnızca gerekli sütunları çeker; geniş `include` ile satır boyutu satır sayısıyla çarpılır.
- Indexler: `tenantId+createdAt`, `tenantId+legalName` sıralamaları; `status` taramaları.

## Her iki veritabanında

Optimizasyonlar SQLite (dev) ve PostgreSQL (prod) üzerinde aynı Prisma sorgularıyla çalışır; index/şema
değişiklikleri `prisma db push` ile her iki tarafa uygulanır. Doğrulama final bölümünde (SQLite + PG build + E2E).

## Yeniden ölçüm

```bash
npm run build
$env:NODE_ENV="production"; node node_modules/next/dist/bin/next start -p 3100
# ayrı kabukta: giriş + sayfa süreleri (Playwright ölçüm betiği)
```
