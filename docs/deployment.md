# Üretim Dağıtım Kılavuzu

## 0. Doğrulanmış PostgreSQL kurulumu (bu projede test edildi)

Aşağıdaki adımlar bu makinede **gerçekten çalıştırılıp doğrulandı** (native PostgreSQL 16, Windows;
Docker/WSL2 gerektirmeden). Gerçek migration üretildi, seed yüklendi, build + 48 unit + 7 davranış
doğrulaması + 5 Playwright E2E + pg_dump/pg_restore başarıyla geçti.

```powershell
# 1) PostgreSQL 16 kur (reboot gerekmez)
winget install -e --id PostgreSQL.PostgreSQL.16 --silent `
  --override "--mode unattended --superpassword <PAROLA> --serverport 5432"

# 2) Cluster'ı kullanıcı-yazılabilir bir dizinde başlat (locale=C; sistem locale non-ASCII olabilir)
$PG="C:\Program Files\PostgreSQL\16\bin"; $DATA="C:\Users\<user>\pgdata"
& "$PG\initdb.exe" -D $DATA -U postgres --pwfile=<pw.txt> -E UTF8 --locale=C
& "$PG\pg_ctl.exe" -D $DATA -o "-p 5432" -l "$DATA\server.log" start

# 3) Veritabanları
& "$PG\createdb.exe" -U postgres -h 127.0.0.1 coil_dev
& "$PG\createdb.exe" -U postgres -h 127.0.0.1 coil_test

# 4) Prisma: provider'ı postgresql yap, migration üret + uygula + seed
#   (schema.prisma: datasource db { provider = "postgresql" })
$env:DATABASE_URL="postgresql://postgres:<PAROLA>@127.0.0.1:5432/coil_dev?schema=public"
npx prisma migrate dev --name init     # prisma/migrations/ üretilir ve uygulanır
npx prisma db seed
npm run build ; npm test               # temiz build + testler
```

> Ünix/Docker ortamında `docker compose up -d db` ile aynı sonuç elde edilir (bkz. `docker-compose.yml`).
> Migration seti `prisma/migrations/` altında hazırdır; prod'da `npx prisma migrate deploy` kullanın.

## 1. PostgreSQL'e geçiş

`prisma/schema.prisma` içindeki datasource'u değiştirin:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

`.env` (veya ortam):

```env
NODE_ENV="production"
DATABASE_URL="postgresql://coil:GÜÇLÜ_PAROLA@db:5432/coil_procurement?schema=public"
AUTH_SECRET="<openssl rand -base64 48>"
APP_URL="https://satinalma.coilpartners.com"
EMAIL_PROVIDER="graph"   # veya smtp/sendgrid/ses
STORAGE_PROVIDER="s3"
EXCHANGE_RATE_PROVIDER="tcmb"
```

## 2. Docker Compose ile

```bash
# .env içinde AUTH_SECRET ve e-posta/depolama değişkenlerini doldurun
docker compose up -d db redis
# İlk kurulum: şema + (isteğe bağlı) admin verisi
docker compose run --rm app npx prisma migrate deploy
docker compose up -d --build app
```

> İlk şema için migration yoksa: `npx prisma migrate dev --name init` (bir kez, geliştirmede) ile migration üretin; üretimde `migrate deploy` çalıştırın.

## 3. Migration stratejisi

- Geliştirmede: `npm run db:migrate` (`prisma migrate dev`).
- Üretimde: `npx prisma migrate deploy` (idempotent, geri alınamaz DDL'lere dikkat).
- Sıfır/az kesinti: Genişlet-ve-daralt (expand/contract) yaklaşımı — önce ekle, kod geçişinden sonra kaldır.

## 4. Reverse proxy & TLS

Nginx/Traefik arkasında TLS sonlandırma, HSTS, HTTP→HTTPS yönlendirme. Uygulama 3000 portunda dinler (`server.js` standalone).

## 5. Sağlık & izleme

- **Health:** `GET /api/health` (DB kontrolü dahil) → 200/503.
- **Loglar:** structured error logları; prod'da bir error-monitoring adapter'ı (Sentry vb.) bağlanabilir.
- **Metrics/Correlation ID:** audit ve iş kayıtlarında correlation ID alanları mevcuttur.

## 6. Ölçekleme

- Uygulama stateless (oturum DB'de) → yatay ölçeklenebilir.
- Hız sınırlama ve e-posta kuyruğu için çok örnekli dağıtımda **Redis** (`REDIS_URL`) kullanın.
- Arka plan işleri (e-posta kuyruğu, hatırlatmalar, kur çekimi) için zamanlanmış bir worker (cron/queue) ekleyin.

## 7. Yükleme sonrası kontrol

1. `/api/health` → `{"status":"ok"}`.
2. Admin ile giriş, bir talep→onay→RFQ→sipariş turu.
3. Test e-postası (gerçek sağlayıcı) ve gelen webhook eşleştirmesi.
4. Yedekleme işini doğrulayın ([`backup-restore.md`](backup-restore.md)).
