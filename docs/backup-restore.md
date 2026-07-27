# Yedekleme ve Geri Yükleme

## PostgreSQL (üretim)

### Yedekleme
```bash
# Mantıksal yedek (günlük cron önerilir)
docker exec coil-db pg_dump -U coil -Fc coil_procurement > backup_$(date +%F).dump

# Sürekli arşivleme (PITR) için WAL arşivlemesi yapılandırın (postgresql.conf).
```

### Geri yükleme
```bash
docker exec -i coil-db pg_restore -U coil -d coil_procurement --clean --if-exists < backup_2026-07-27.dump
```

### Öneriler
- Günlük tam + saatlik WAL (PITR).
- Yedekleri **şifreli** ve farklı bölgede saklayın (3-2-1 kuralı).
- Aylık **geri yükleme tatbikatı** yapın.
- Saklama: finansal/denetim verisi için yasal saklama süreleri (KVKK/VUK) gözetilmelidir.

## SQLite (geliştirme)

```bash
# Yedek
copy prisma\dev.db prisma\dev.backup.db      # Windows
cp prisma/dev.db prisma/dev.backup.db        # *nix
# Geri yükleme: dosyayı geri kopyalayın (uygulama durdurulmuşken).
```

## Dosya depolama (S3)

- Bucket **sürümleme** ve **çapraz-bölge replikasyon** açık olmalı.
- Yaşam döngüsü kuralı ile eski sürümler arşivlenir.

## Felaket kurtarma (özet)

| Bileşen | RPO | RTO | Yöntem |
|---|---|---|---|
| Veritabanı | ≤ 1 saat | ≤ 1 saat | pg_dump + WAL (PITR) |
| Dosyalar | ~0 | dk | S3 sürümleme/replikasyon |
| Uygulama | – | dk | Stateless; yeniden dağıt |
