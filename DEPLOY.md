# 🚀 Canlıya Alım Kılavuzu — Vercel + Neon (PostgreSQL) + Cloudflare

Bu rehber, **Coil Procurement Hub**'ı sıfırdan production'a almak için adım adım
talimat verir. Mimari: **Hosting → Vercel**, **DB → PostgreSQL (Neon/Supabase)**,
**DNS/Domain → Cloudflare**.

> **Önemli notlar (bu proje özelinde):**
> - Proje **NextAuth kullanmaz**. Oturum secret'ı `AUTH_SECRET` (≥32 karakter),
>   uygulama adresi `APP_URL`'dir. (`NEXTAUTH_SECRET` / `NEXT_PUBLIC_APP_URL` **yoktur**.)
> - **Dev SQLite, Prod PostgreSQL.** `schema.prisma` içinde committed provider `sqlite`'tır;
>   Vercel build'i provider'ı otomatik `postgresql`'e çevirir (bkz. §4). Yerel geliştirmeniz
>   hiç değişmez.
> - Migration geçmişi tek bir **tam baseline** (`prisma/migrations/2026..._baseline`) olarak
>   hazırlandı; fresh prod DB'ye `prisma migrate deploy` ile eksiksiz uygulanır.

---

## 0) Ön Koşullar

- [ ] Kod **GitHub**'da bir repoda (private olabilir).
- [ ] [vercel.com](https://vercel.com), [neon.tech](https://neon.tech) (veya Supabase),
      [cloudflare.com](https://cloudflare.com) hesapları.
- [ ] Alan adınız Cloudflare'de yönetiliyor (nameserver'lar Cloudflare'e yönlendirilmiş).

---

## 1) PostgreSQL Veritabanı (Neon)

1. Neon'da **New Project** → bölge olarak müşteriye yakın olanı seçin (örn. `eu-central-1`).
2. Proje açılınca **Connection Details** ekranından **iki** connection string'i not alın:
   - **Pooled connection** (host'ta `-pooler` geçen) → **uygulama** için (`DATABASE_URL`).
     Serverless/Vercel bunu kullanır. Örnek:
     ```
     postgresql://USER:PASS@ep-xxxx-pooler.eu-central-1.aws.neon.tech/coil?sslmode=require&pgbouncer=true&connect_timeout=15
     ```
   - **Direct connection** (pooler'sız) → **migration** için (opsiyonel ama önerilir; bkz. §5).
3. `sslmode=require` her iki string'de de bulunmalı.

> Supabase kullanacaksanız: **Project Settings → Database → Connection Pooling** (port `6543`)
> string'ini `DATABASE_URL` olarak alın (`?pgbouncer=true&sslmode=require`).

---

## 2) GitHub Reposunu Vercel'e Bağlama

1. Vercel Dashboard → **Add New… → Project**.
2. **Import Git Repository** → Coil reposunu seçin (gerekirse GitHub erişimini yetkilendirin).
3. **Framework Preset**: `Next.js` (otomatik algılanır).
4. **Root Directory**: repo kökü (`./`).
5. **Build & Output Settings** — DOKUNMAYIN. Proje `package.json`'da özel bir
   **`vercel-build`** script'i tanımlı; Vercel bunu otomatik kullanır:
   ```
   vercel-build = set provider→postgresql  →  prisma generate  →  prisma migrate deploy  →  next build
   ```
   Yani şema Postgres'e çevrilir, client üretilir, migration'lar uygulanır ve app derlenir.
6. **Deploy'a henüz basmayın** — önce ortam değişkenlerini girin (§3).

---

## 3) Vercel Ortam Değişkenleri (Environment Variables)

Vercel → Project → **Settings → Environment Variables**. Her birini **Production**
(isterseniz Preview) kapsamına ekleyin:

| Değişken | Değer | Not |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** string (§1) | `sslmode=require` şart |
| `AUTH_SECRET` | `openssl rand -base64 48` çıktısı | ≥32 karakter, gizli |
| `APP_URL` | `https://alan-adiniz.com` | Kesin canlı URL |
| `NODE_ENV` | `production` | |
| `DEFAULT_LOCALE` | `tr` | veya `en` |
| `EMAIL_PROVIDER` | `smtp` / `graph` / `sendgrid` / `ses` | **`mock` KULLANMAYIN** |
| `EMAIL_FROM` | `satinalma@alan-adiniz.com` | |
| *(E-posta provider ayrıntıları)* | `SMTP_*` / `MS_GRAPH_*` / `SENDGRID_API_KEY` / `AWS_*` | Seçtiğinize göre |
| `STORAGE_PROVIDER` | `s3` (**önerilir**) | Aşağıdaki uyarı |
| `S3_*` | endpoint/bucket/key'ler | `STORAGE_PROVIDER=s3` ise |
| `EMAIL_WEBHOOK_SECRET` | rastgele hex | Gelen e-posta webhook'u kullanıyorsanız |

> ⚠️ **Dosya depolama:** Vercel'in dosya sistemi **kalıcı değildir** (deploy'lar arasında
> silinir, `/tmp` dışı yazılamaz). `STORAGE_PROVIDER=local` **production'da veri kaybına**
> yol açar. Yüklenen belgeler için **S3-uyumlu depolama** kullanın (Cloudflare R2, AWS S3,
> Backblaze B2). Kurulum: [docs/storage-s3.md](docs/storage-s3.md).

> ℹ️ **Rate-limit / kuyruk:** `REDIS_URL` verilmezse in-memory fallback kullanılır; serverless'te
> bu instance-başına çalışır. Sıkı rate-limit için yönetilen bir Redis (Upstash) ekleyin.

`openssl` yoksa AUTH_SECRET üretimi (Node):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

---

## 4) Provider Otomasyonu (nasıl çalışıyor — bilgi)

`package.json`:
```jsonc
"vercel-build": "node scripts/set-db-provider.mjs postgresql && prisma generate && prisma migrate deploy && next build"
```
- `scripts/set-db-provider.mjs` yalnız `datasource db { provider }` satırını değiştirir (idempotent).
- Bu değişiklik **Vercel'in geçici build kopyasında** olur; repo'daki `schema.prisma` `sqlite`
  kalır → **yerel geliştirme etkilenmez**.
- `migration_lock.toml` zaten `postgresql`; baseline migration Postgres diyalektindedir.

Yerelde Postgres'e karşı test etmek isterseniz:
```bash
node scripts/set-db-provider.mjs postgresql
# DATABASE_URL=<postgres> npx prisma migrate deploy
node scripts/set-db-provider.mjs sqlite   # bittiğinde geri al
```

---

## 5) İlk Deploy + Migration + Seed

1. §3 bittikten sonra Vercel'de **Deploy**'a basın. Build sırasında `prisma migrate deploy`
   fresh Neon DB'ye **tüm tabloları** oluşturur.
2. **İlk yönetici + tenant tohumlama (bir kez).** Boş DB ile giriş yapamazsınız; seed gerekir.
   Yerel makinenizden **prod DB'ye** yönelterek çalıştırın (dev.db'ye DOKUNMAZ):
   ```bash
   # DIRECT (pooler'sız) connection string kullanın — migrate/seed için daha güvenli
   DATABASE_URL="postgresql://...neon.tech/coil?sslmode=require" \
     node scripts/set-db-provider.mjs postgresql
   DATABASE_URL="postgresql://...neon.tech/coil?sslmode=require" npx prisma db seed
   node scripts/set-db-provider.mjs sqlite   # provider'ı geri al
   ```
   > `prisma/seed.ts` tenant, roller ve ilk admin kullanıcısını oluşturur. Seed'in ürettiği
   > admin e-posta/parolasını not edin ve **ilk girişte değiştirin**.
3. Alternatif: migration'ları build'de değil, elle uygulamak isterseniz `vercel-build`'ten
   `prisma migrate deploy`'u çıkarıp yerelden `npm run db:deploy` (DATABASE_URL=prod) çalıştırın.

### (Opsiyonel) Mevcut gerçek veriyi taşıma
Dev `dev.db` içindeki gerçek tedarikçi/sipariş verisini prod'a taşımak ayrı bir iştir
(SQLite→Postgres veri aktarımı). Hızlı yol: bir tenant export/import script'i ya da
`pgloader`. Bu rehber altyapıya odaklıdır; veri taşıma gerekiyorsa ayrıca planlanmalı.

---

## 6) Cloudflare DNS — Alan Adını Vercel'e Yönlendirme

Önce Vercel'de domain'i tanıtın: Vercel → Project → **Settings → Domains → Add** →
`alan-adiniz.com` (ve/veya `www.alan-adiniz.com`). Vercel size hedef kayıtları söyler.

Sonra **Cloudflare → DNS → Records**:

| Tip | Ad (Name) | Hedef (Content) | Proxy |
|---|---|---|---|
| `A` | `@` (kök) | `76.76.21.21` | **DNS only (gri bulut)** ilk doğrulamada |
| `CNAME` | `www` | `cname.vercel-dns.com` | **DNS only (gri bulut)** |

Adımlar:
1. Kök alan (`@`) için Vercel'in verdiği **A kaydını** (`76.76.21.21`) girin. *(Vercel farklı bir
   IP verdiyse onu kullanın.)*
2. `www` için **CNAME → `cname.vercel-dns.com`** girin.
3. **İlk kurulumda Proxy'yi kapatın (gri bulut / "DNS only")** — Vercel domain doğrulaması ve
   SSL sertifikası düzgün çıksın diye. Vercel domain'i **Valid/Ready** gösterince (birkaç dakika),
   isterseniz proxy'yi (turuncu bulut) açabilirsiniz.
4. Cloudflare **SSL/TLS → Overview → Encryption mode = `Full (strict)`** yapın. (`Flexible`
   **KULLANMAYIN**; yönlendirme döngüsü/karışık içerik oluşur.)
5. Vercel'de her iki domain de "Valid Configuration" olunca `APP_URL`'i canonical host'a
   (örn. `https://alan-adiniz.com`) ayarladığınızdan emin olun; www→kök (veya tersi)
   yönlendirmesini Vercel Domains ekranından seçin.

> Yalnız `www` kullanacaksanız kök için de bir yönlendirme kaydı bırakın. Turuncu bulut (proxy)
> açıkken Cloudflare "Always Use HTTPS" ve otomatik HTTPS Rewrites'ı açık tutabilirsiniz.

---

## 7) Deploy Sonrası Doğrulama (Smoke Test)

- [ ] `https://alan-adiniz.com/login` **200** dönüyor ve stil/JS yükleniyor.
- [ ] Seed admin ile giriş → `/dashboard` açılıyor.
- [ ] Yeni kayıt oluştur (talep/sipariş) → DB'ye yazılıyor (Neon "Tables" ekranından teyit).
- [ ] Bir Excel dışa/içe aktarma (exceljs) çalışıyor.
- [ ] Dil değiştir (tr/en) → i18n çalışıyor.
- [ ] Bir Server Action (örn. üretim aşaması güncelle) hata vermiyor.
- [ ] Tedarikçi portalı: davet linki üret → `/reset-password/...` → giriş → `/portal/orders`.
- [ ] E-posta provider'ı gerçek (mock değil): bir bildirim/mağic-link gidiyor.

Sorun olursa Vercel → Project → **Deployments → (build) → Logs** ve **Runtime Logs**'a bakın.

---

## 8) Sık Karşılaşılan Sorunlar

| Belirti | Neden / Çözüm |
|---|---|
| Build'de `Environment variable not found: DATABASE_URL` | Vercel env değişkenleri Production kapsamında değil. §3. |
| `provider mismatch (sqlite vs postgresql)` | `vercel-build` çalışmamış (Build Command elle override edilmiş). Ayarı **default** bırakın. |
| Giriş yok / "tenant bulunamadı" | Seed çalıştırılmadı. §5.2. |
| Yüklenen belgeler kayboluyor | `STORAGE_PROVIDER=local` — S3'e geçin. §3 uyarısı. |
| Sonsuz HTTPS yönlendirmesi | Cloudflare SSL modu `Flexible`. `Full (strict)` yapın. §6.4. |
| İlk domain doğrulaması takılı | Cloudflare proxy açık (turuncu). İlk doğrulamada gri bulut yapın. §6.3. |
| `prisma migrate deploy` timeout | Migration için **pooled değil, direct** connection kullanın. §5.3. |

---

## 9) Özet Komut Kartı

```bash
# AUTH_SECRET üret
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Prod DB'ye migration (yerelden, gerekirse)
node scripts/set-db-provider.mjs postgresql
DATABASE_URL="<neon-direct>" npx prisma migrate deploy
DATABASE_URL="<neon-direct>" npx prisma db seed
node scripts/set-db-provider.mjs sqlite

# Yerel geliştirme (değişmedi)
npm run dev
```

İlgili dökümanlar: [docs/deployment.md](docs/deployment.md) ·
[docs/postgres-migration.md](docs/postgres-migration.md) · [docs/storage-s3.md](docs/storage-s3.md) ·
[docs/backup-restore.md](docs/backup-restore.md)
