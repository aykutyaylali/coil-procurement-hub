# Üretim Dağıtım Kılavuzu

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
