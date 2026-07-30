# PostgreSQL Migration & Config Guide

Bu kılavuz, geliştirmede kullanılan **SQLite**'tan üretim için **PostgreSQL**'e
geçişi adım adım anlatır. Kod tabanı bu geçişe hazır tasarlandı (tüm parasal/miktar
alanları `decimal-as-string`, enum'lar `String`, JSON alanlar `String`), bu yüzden
**şema tipi değişikliği gerekmez** — yalnızca provider + bağlantı + birkaç davranış farkı.

> ⚠️ Dev ortamı SQLite'ta kalmaya devam edebilir. Bu geçiş **yalnızca üretim** (veya
> ayrı bir staging) için gereklidir. `prisma/dev.db` içindeki gerçek veriyi bozmadan,
> ayrı bir PostgreSQL veritabanına taşırsınız.

---

## 1. PostgreSQL sunucusu hazırlayın

Yerel (Docker) örnek:

```bash
docker run --name coil-pg -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=coil \
  -p 5432:5432 -d postgres:16
```

Yönetilen seçenekler: Neon, Supabase, AWS RDS, Azure Database for PostgreSQL, Railway.

Bağlantı dizesi (SSL genelde zorunludur — yönetilen servislerde `?sslmode=require` ekleyin):

```
postgresql://KULLANICI:PAROLA@HOST:5432/coil?schema=public
```

## 2. `schema.prisma` provider'ını değiştirin

`prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // önceki: "sqlite"
  url      = env("DATABASE_URL")
}
```

Başka **hiçbir alan değişikliği gerekmez.** Kod tabanı bilinçli olarak:
- Parasal/miktar → `String` (`decimal.js` ile işlenir; `@db.Decimal` gerekmez ama isterseniz
  üretimde `@db.Decimal(18,4)`'e geçirilebilir — zorunlu değil).
- Enum'lar → `String` (yorumda izinli değerler listeli).
- JSON alanlar → `String` (isterseniz PostgreSQL'de `Json` tipine geçirilebilir; parite için
  `String` bırakmak en güvenlisidir).

## 3. `.env` / `.env.production` güncelleyin

```
DATABASE_URL="postgresql://KULLANICI:PAROLA@HOST:5432/coil?schema=public&sslmode=require"
```

Diğer üretim değişkenleri (bkz. `.env.example`): `APP_URL`, e-posta sağlayıcısı,
`STORAGE_PROVIDER=s3` (+ `S3_*`), `EMAIL_WEBHOOK_SECRET`, `ANTIVIRUS_PROVIDER` vb.

## 4. Şemayı PostgreSQL'e uygulayın

Dev'de `db push` kullanıldığı için migration geçmişi SQLite tabanlıdır. Üretimde temiz
bir migration geçmişiyle başlamak önerilir:

```bash
# Mevcut sqlite migration klasörünü koruyup Postgres için taze bir baseline üretin:
rm -rf prisma/migrations           # (yalnızca Postgres'e tam geçişte; sqlite geçmişini
                                    #  saklamak isterseniz ayrı bir branch'te yapın)
npx prisma migrate dev --name init_postgres
```

Alternatif (migration geçmişi tutmadan, hızlı): `npx prisma db push`.

`npx prisma generate` derleme sırasında zaten çalışır (`build` script'i).

## 5. Verileri SQLite'tan PostgreSQL'e taşıyın

Tüm alanlar taşınabilir tiplerde olduğu için Prisma tabanlı bir kopya script'i güvenlidir.
İki ayrı `PrismaClient` (biri sqlite, biri postgres) ile tabloları bağımlılık sırasına
göre kopyalayın (tenant → company → user → supplier → requisition → … → invoice).

Basit yaklaşım (özet):

```ts
// scripts/migrate-sqlite-to-pg.ts (örnek iskelet)
import { PrismaClient } from "@prisma/client";
const src = new PrismaClient({ datasources: { db: { url: "file:./prisma/dev.db" } } });
const dst = new PrismaClient({ datasources: { db: { url: process.env.PG_URL } } });
// createMany ile bağımlılık sırasına göre: tenant, company, department, user, supplier, ...
// İlişkisel FK sırasına dikkat; her tabloyu kaynaktan okuyup hedefe createMany yapın.
```

Alternatif araç: **pgloader** (SQLite → PostgreSQL) — şema dönüşümünü otomatik yapar,
ancak Prisma migration ile üretilen şemayla kolon adları birebir uyuşmalıdır.

> Not: `Attachment`/dosyalar `storage/` dizininde (veya S3'te) tutulur; DB yalnızca
> `storageKey` saklar. Yerel diskten S3'e geçiyorsanız dosyaları da kopyalayın.

## 6. Davranış farkları (önemli)

- **`contains` büyük/küçük harf duyarlılığı:** SQLite ASCII için varsayılan olarak
  duyarsızdır; **PostgreSQL `contains` duyarlıdır.** Arama (`/search`) ve benzeri
  filtrelerde beklenen davranışı korumak için gerekli sorgulara
  `mode: "insensitive"` ekleyin. Etkilenen başlıca yerler: `src/app/(app)/search/page.tsx`,
  liste sayfalarındaki `q` filtreleri.
- **Sıralama/collation:** Türkçe sıralama için gerekiyorsa DB collation'ını ayarlayın.
- **Eşzamanlılık:** SQLite tek-yazar; PostgreSQL çok-yazar — üretim yükünde avantaj.
  Middleware'deki in-memory rate-limit çok-örnekli dağıtımda Redis'e taşınmalıdır.
- **Bağlantı havuzu:** Serverless (Vercel) için `?pgbouncer=true` + `connection_limit`
  veya Prisma Data Proxy/Accelerate kullanın.

## 7. Doğrulama kontrol listesi

- [ ] `npx prisma migrate deploy` (veya `db push`) hatasız
- [ ] `npx prisma generate` + `npm run build` başarılı
- [ ] Kayıt sayıları kaynak ↔ hedef eşit (tenant/supplier/requisition/order/invoice)
- [ ] Giriş + MFA çalışıyor; RBAC ve tenant izolasyonu korunuyor
- [ ] Arama büyük/küçük harf duyarsız çalışıyor (`mode: "insensitive"` uygulandıysa)
- [ ] PDF üretimi (logo + Türkçe font) çalışıyor
- [ ] E-posta kuyruğu + inbound webhook (HMAC) çalışıyor
- [ ] Dosya yükleme/indirme (Attachment) çalışıyor

## 8. Geri dönüş (rollback)

Provider değişikliği tek satır olduğundan geri dönüş kolaydır: `schema.prisma`'da
`provider = "sqlite"` + `DATABASE_URL="file:./dev.db"` ile dev'e dönülür. Üretim verisi
ayrı PostgreSQL'de kaldığı için dev verisi hiç etkilenmez.
