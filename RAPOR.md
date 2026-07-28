# Coil Procurement Hub — Çalışma Raporu

> Bu dosya yapılan her şeyin güncel özetidir. Her önemli aşamada güncellenir.
> Son güncelleme: 4. oturum — acil hata+performans fazı + onay politikası + Excel talep import (son commit `a226861`).

## 4. oturum ek işler (onay politikası + talep import)

- **Onay politikası (`ea3d494`)** — "her talep onaya gitmesin": onaya gidip gitmeyeceğini **satınalma** belirler.
  Company.settings'te `reqApproval` (ALWAYS/THRESHOLD/NEVER + eşik). `/requisitions/approval-policy` ekranı
  (REQUISITION_ASSIGN = satınalma). Eşik altı talepler onay beklemeden APPROVED olur; satınalma doğrudan RFQ yapar.
- **Excel talep import (`a226861`)** — Excel "Kalem Detayları"ndaki Talep No + Talep Eden'den türetildi:
  **18 talep açan → kullanıcı** (giriş yapamaz, passwordHash null, `@imported.coilpartners.com`),
  **433 talep → PurchaseRequisition (ORDERED) + 1032 kalem**. Mutabık (18/18, 433/433, 1032/1032), idempotent.
  `scripts/import-requisitions.ts` (yedek sonrası çalışır, Excel salt-okunur, boş fiyat 0 uydurulmaz).
- **Menü yavaşlığı**: ölçüldü — **DEV modu kaynaklı** (cold ~2800ms derleme, warm ~1130ms); production ~730ms.
  Hız için `npm run build` + production `next start` önerilir (anında loading iskeleti + prefetch eklendi).

## Genel durum

- **Konum:** `C:\Users\Aykut\coil-procurement-hub`
- **Çalıştırma:** `npm run dev` → http://localhost:3000
- **Demo giriş:** `admin@coilpartners.com` / `Coil2026!` (diğer roller README'de)
- **Sağlık:** ESLint **0 hata/uyarı**, TypeScript typecheck **0 hata**, **99 test** (unit+integration) geçiyor,
  Playwright **12 E2E** geçiyor — **hem SQLite hem PostgreSQL production build üzerinde 12/12**, build **temiz**.
- **Veri:** Gerçek geçmiş satınalma verisi içe aktarıldı — **494 sipariş** (490 imported + seed), 70,4M ₺ (korundu).
- **Git:** her aşama ayrı commit; çalışma ağacı temiz. Kaynak Excel/yedekler `.gitignore`'da.

## Acil hata düzeltme + performans fazı (4. oturum) — ayrı commitler

Gerçek kullanım testinde bildirilen 4 sorun kök nedeninden çözüldü (try/catch ile gizlenmedi):

| Commit | Konu | Sonuç |
|---|---|---|
| `3f24ede` | **Talep taslak/gönderim hatası** | Kök neden: tek katı şema + `fail()` ham Zod JSON sızdırıyordu. Taslak (minimal, her zaman DRAFT) ↔ gönderim (tam doğrulama) **ayrıldı** (domain + server action). `fail()` artık ZodError→alan bazlı, Prisma→dostça, beklenmeyen→correlation ID; **ham hata asla sızmaz**. Idempotency alanı (`clientRequestId`). |
| `bcae854` | **Kullanıcı dostu doğrulama + toast** | Erişilebilir toast sistemi (success/error/warning/info). Formda alan altı hata + üstte erişilebilir özet + ilk hataya odak + iki dilli mesaj + spinner + çift-tıklama koruması; başarısızlıkta form korunur. |
| `859b87e` | **Performans** | **Güvenlik**: liste `include:{requester:true}` passwordHash/mfaSecret sızdırıyordu → `select`. Server-side **pagination** (494 siparişin tümü erişilebilir). Dashboard bekleyen-onay 2×→1× (React cache) + indexler + anında loading iskeleti. Ölçüm: `docs/performance-report.md` (production build, önce/sonra). |
| `ad0e3ff` | **Regresyon testleri (12 senaryo)** | Birim (taslak/gönderim doğrulama, `fail` ham-sızıntı) + entegrasyon (idempotency, tenant izolasyonu) + tarayıcı (talep akışı, pagination). |

**Final doğrulama:** ESLint 0 · tsc 0 · vitest **99/99** (mojibake + i18n parite dahil) · SQLite build 41 route ·
**SQLite E2E 12/12** · PG db push/generate/build · **PostgreSQL E2E 12/12** · mojibake temiz · perf önce/sonra ölçüldü.

## Son tamamlama fazı (3. oturum) — hepsi ayrı commit

İlk ana gereksinime göre "isteğe bağlı / mekanik / canlı veri birikince" olarak bırakılan tüm maddeler tamamlandı:

| Commit | Aşama | Sonuç |
|---|---|---|
| `2f9f032` | **A — Sözleşme CRUD** | oluştur/düzenle/detay, limit, fiyat listesi, SLA, statü + audit sürüm geçmişi |
| `ef2ad07` | **B — Bütçe CRUD + gerçek kontrol** | oluştur/düzenle/detay + hareketler; talep gönderiminde **gerçek bütçe rezerv/serbest** |
| `21d309f` | **C — Katalog CRUD + import** | oluştur/düzenle/detay, fiyat geçmişi, tercih tedarikçi, birim dönüşüm, CSV import |
| `ecc8712` | **D — Hesaplama motorları** | OTIF/çevrim süresi/onay bekleme/tasarruf saf fonksiyonlar + **"veri yetersiz"** göstergesi + gerçek DB + demo senaryo + 8 test |
| `979b972` | **E — Tam E2E** | talep→onay→onay→RFQ zinciri (tarayıcı) + arka yarı (award→PO→3'lü eşleştirme) — **SQLite + PostgreSQL 6/6** |
| `d5663dc` | **F — i18n** | tr/en **parite testi** (runtime + tip ile derleme-zamanı) + düzgün İngilizce durum etiketleri (`STATUS_LABELS_EN`) |
| `7e87911` | **G — Rol bazlı denetim** | TODO/placeholder/ölü-link YOK; bulunan 2 liste-only boşluk (**Tedarikçi**, **Kullanıcı**) tam CRUD ile kapatıldı; E2E ile doğrulandı |

**Final doğrulama battery'si (H):** ESLint 0 · tsc 0 · vitest **80/80** (mojibake + i18n parite guard dahil) ·
SQLite build 41 route temiz · **SQLite E2E 8/8** · PG db push/generate/build temiz · **PostgreSQL E2E 8/8** · mojibake taraması temiz.

## Son tamamlama fazı (3. oturum) — hepsi ayrı commit

İlk ana gereksinime göre "isteğe bağlı / mekanik / canlı veri birikince" olarak bırakılan tüm maddeler tamamlandı:

| Commit | Aşama | Sonuç |
|---|---|---|
| `2f9f032` | **A — Sözleşme CRUD** | oluştur/düzenle/detay, limit, fiyat listesi, SLA, statü + audit sürüm geçmişi |
| `ef2ad07` | **B — Bütçe CRUD + gerçek kontrol** | oluştur/düzenle/detay + hareketler; talep gönderiminde **gerçek bütçe rezerv/serbest** |
| `21d309f` | **C — Katalog CRUD + import** | oluştur/düzenle/detay, fiyat geçmişi, tercih tedarikçi, birim dönüşüm, CSV import |
| `ecc8712` | **D — Hesaplama motorları** | OTIF/çevrim süresi/onay bekleme/tasarruf saf fonksiyonlar + **"veri yetersiz"** göstergesi + gerçek DB + demo senaryo + 8 test |
| `979b972` | **E — Tam E2E** | talep→onay→onay→RFQ zinciri (tarayıcı) + arka yarı (award→PO→3'lü eşleştirme) — **SQLite + PostgreSQL 6/6** |
| `d5663dc` | **F — i18n** | tr/en **parite testi** (runtime + tip ile derleme-zamanı) + düzgün İngilizce durum etiketleri (`STATUS_LABELS_EN`) |
| `7e87911` | **G — Rol bazlı denetim** | TODO/placeholder/ölü-link YOK; bulunan 2 liste-only boşluk (**Tedarikçi**, **Kullanıcı**) tam CRUD ile kapatıldı; E2E ile doğrulandı |

**Final doğrulama battery'si (H):** ESLint 0 · tsc 0 · vitest **80/80** (mojibake + i18n parite guard dahil) ·
SQLite build 41 route temiz · **SQLite E2E 8/8** · PG db push/generate/build temiz · **PostgreSQL E2E 8/8** · mojibake taraması temiz.

## Teknoloji

Next.js 15 (App Router) · TypeScript strict · Prisma (SQLite dev / PostgreSQL prod) · Tailwind · özel güvenli oturum + TOTP MFA · decimal.js (floating-point yok) · Vitest + Playwright · pdfkit (Türkçe PDF).

## Tamamlanan modüller (çalışan, placeholder yok)

### Faz 1 — Çekirdek (commit `f2e41c8`)
- 70+ tablo Prisma şeması, çok şirketli tenant izolasyonu.
- Kimlik doğrulama, oturum, TOTP MFA, hesap kilitleme, parola sıfırlama.
- RBAC (16 rol) + kayıt bazlı kapsam; onay motoru (koşullu kurallar, görevler ayrılığı, vekâlet).
- Uçtan uca akış: **Talep → onay → RFQ → tedarikçi magic-link teklifi → karşılaştırma → split award → sipariş → onay/gönderim**.
- E-posta altyapısı (mock/SMTP/Graph/SendGrid/SES) + kuyruk + gelen eşleştirme.
- Çift dil (TR/EN) i18n mimarisi; operasyon türü (yurt içi/ithalat/ihracat) + landed cost.
- Tüm modüllerde gerçek veri okuyan liste/detay ekranları; değişmez audit log.
- Dashboard, raporlar (temel), global arama, denetim, entegrasyon merkezi, yönetim ekranları.
- Docs (11 kılavuz) + docker-compose + Dockerfile + seed.

### Faz 2 — Mal Kabul + Kalite (commit `f8102fa`)
- **Mal Kabul:** oluşturma/detay, kısmi/çoklu kabul, disposition, lot-seri-raf, irsaliye,
  **backend miktar validasyonu** (açık miktar + fazla teslimat toleransı), kalite kuyruğu, audit.
- **Kalite:** kontrol tamamlama (uygun/şartlı/ret), **NCR** (kök neden, düzeltici/önleyici, disposition,
  maliyet, sorumlu, doğrulama, kapanış), **CAPA/8D** oluşturma/yönetim, tedarikçi performansına etki.
- Tolerans ayarları, dosya yükleme (attachment) altyapısı.

### Geçmiş Veri İçe Aktarma (commit `8ee23be`) + GERÇEK İMPORT YAPILDI
- Excel motoru + **sihirbaz** (yükle → sütun eşleştirme → özet → uyarılar → dry-run → onay → sonuç → hatalı satır CSV).
- **GERÇEK İMPORT ÇALIŞTIRILDI** (kullanıcı onayıyla). Batch: `cms48jnjf0000vx9sb9d26wpa`.
  - Tarihli SQLite yedeği alındı → `prisma/backups/dev-2026-07-28T05-48-54.db`
  - 490 sipariş · 1.032 kalem · 117 yeni tedarikçi · 8 kategori · **70.435.847,79 ₺** yazıldı.
- **MUTABAKAT (Excel ↔ DB) — TÜM BOYUTLAR OK:** sipariş 490=490, kalem 1032=1032, tedarikçi 117=117,
  toplam TL 70.435.847,79=70.435.847,79, eksik fiyat/KDV/teslim 50/69/59 eşit,
  para birimi (TRY 7.713.126 / EUR 62.067.401 / USD 655.320) ve 8 kategori toplamı birebir tutuyor.
  Kurallar korundu: tarihsel TL ayrı, boş değer null (0 değil), tedarikçi normalize, mükerrer 0.
- İdempotent (mevcut sipariş atlanır), otomatik yedek, transaction, **kontrollü geri alma**, audit.
- Kurallar: tarihsel TL ayrı saklanır (yeniden hesaplanmaz), boş fiyat/KDV null (0 ile doldurulmaz),
  tedarikçi/kategori normalize, talep eden geçmiş referans (login oluşturulmaz).

### Faz 2 — Fatura + Üçlü Eşleştirme (commit `c63742a`)
- **matching engine:** PO–Mal Kabul–Fatura satır bazlı miktar/fiyat/vergi farkı + tolerans sonucu
  (MATCHED/OVER_INVOICED/PRICE_VARIANCE/NOT_RECEIVED).
- Fatura oluşturma formu (PO seçimi, mal kabul satırları önden dolu, tevkifat), tolerans dışı → **BLOCKED**
  + istisna onayı (gerekçe zorunlu), **mükerrer engel**, PO `INVOICED` geçişi, 3-way eşleştirme tablosu.

### Faz 2 — PDF Üretimi (commit `6bc12bd`)
- **pdfkit + DejaVu Türkçe font**; markalı, çift dilli (TR/EN) PDF: **Sipariş, RFQ, Karşılaştırma, Mal Kabul,
  NCR, Tedarikçi Değerlendirme** — indirme rotaları + detay sayfalarında butonlar. Harcama raporu PDF'i de var.
- **Not:** geliştirme sırasında bazı dosyalarda oluşan Türkçe karakter (mojibake) bozulması tespit edildi ve
  **tüm kaynak dosyalarda deterministik onarıldı** (0 kaldı, doğrulandı). PDF başlıkları artık doğru: "SATINALMA SİPARİŞİ", "TEDARİKÇİ".

### PostgreSQL Doğrulaması — GERÇEKTEN ÇALIŞTIRILDI VE DOĞRULANDI
- Docker/WSL2 kurulu değildi ve WSL2 yeniden başlatma gerektirdiğinden, **native PostgreSQL 16**
  winget ile kuruldu (reboot yok). Cluster `C:\Users\Aykut\pgdata`, port 5432, superuser `postgres`.
- **Gerçek Prisma migration** oluşturuldu ve uygulandı: `prisma/migrations/20260728061258_init/`.
- Seed PG'de çalıştı: 9 kullanıcı, 16 rol, 15 tedarikçi, 1 şirket (tüm demo hesaplar mevcut).
- **Doğrulama sonuçları (hepsi geçti):**
  - Production build (postgresql provider): **temiz**
  - Unit testler: **48/48**
  - Davranış doğrulaması **7/7**: decimal-as-string hassasiyet, tarih UTC, JSON round-trip (Türkçe),
    unique constraint (P2002), transaction rollback, tenant izolasyonu, Türkçe UTF8 arama.
  - **Playwright E2E (PG-destekli sunucu üzerinde): 5/5** (giriş akışı, RBAC, magic-link, i18n).
  - **backup/restore:** `pg_dump -Fc` (194KB) → yeni DB'ye `pg_restore` → doğrulandı.
- Doğrulama sonrası **SQLite'a geri dönüldü**; import verisi korundu (492 PO = 490 imported + 2 seed).
- Prod geçişi: `schema.prisma` provider `postgresql` + `prisma migrate deploy` (migration seti hazır).
- PG servisi manuel başlatıldı: `& "C:\Program Files\PostgreSQL\16\bin\pg_ctl" -D C:\Users\Aykut\pgdata start`.

## 2. Oturumda tamamlananlar (özet)

| Commit | İçerik |
|---|---|
| `6581a61` | **Gerçek Excel import** çalıştırıldı + Excel↔DB mutabakatı tüm boyutlarda OK |
| `e58bc57` | **Raporlar** gerçek metriklerle (harcama/kategori/tedarikçi/operasyon/PB/aylık/talep eden) + filtreler + CSV/PDF |
| `562cd06` | **i18n**: üst menü dil değiştirici (TR/EN, tercih saklanır) + **mojibake regresyon testi** |
| `b353074` | **PostgreSQL doğrulaması**: gerçek migration + seed + build + 48 unit + 7 davranış + 5 E2E + backup/restore |
| `6e8fd3c` | **Güvenlik/iş kuralı testleri**: görevler ayrılığı, vekâlet, yetkisiz-red, mükerrer fatura, tenant izolasyonu + token/TOTP/parola |

| `b562ccc` | **Son doğrulama**: ESLint temiz + RAPOR/deployment güncellendi (doğrulanmış PostgreSQL komutları) |

### Sürüm tarihçesi — test/E2E snapshot (geçmiş; güncel değil)

Aşağıdaki sayılar ilgili oturumun sonundaki durumdur; **güncel değer 80 test / 8 E2E** (sayfa başı).

| Oturum | Birim+entegrasyon test | E2E (tarayıcı) | Not |
|---|---|---|---|
| 2. oturum sonu | 62 (10 dosya) | 5 | PostgreSQL doğrulaması + güvenlik/iş kuralı testleri |
| **3. oturum sonu (güncel)** | **80 (13 dosya)** | **8** | Sözleşme/Bütçe/Katalog/Tedarikçi/Kullanıcı CRUD + metrik motorları + i18n parite |

### Test kapsamı (güncel: 80 test / 13 dosya)
- **Birim:** para (decimal, floating-point yok), durum makineleri (geçersiz geçiş engelleme), RBAC yetki matrisi,
  landed cost dağıtımı, **i18n tr/en parite** + eksik-anahtar + Türkçe sıralama, **mojibake regresyon**, import ayrıştırma,
  üçlü eşleştirme tolerans, **OTIF/çevrim/tasarruf metrik motorları**, güvenlik primitifleri (token hash/TOTP/parola).
- **Entegrasyon (gerçek DB, rollback tx):** görevler ayrılığı, başka yetkilinin onayı, **vekâlet**,
  yetkisiz reddi, **mükerrer fatura (unique)**, **tenant izolasyonu**, award→PO hesabı, üçlü eşleştirme, magic-link teklif.
- **E2E — tarayıcıda yürütülen adımlar (Playwright, 8):** talep→amir onayı→müdür onayı→RFQ oluşturma zinciri,
  **tedarikçi & kullanıcı oluşturma** (gerçek server action + DB doğrulama), korumalı sayfa yönlendirme,
  giriş→dashboard, hatalı parola reddi, magic-link token reddi, tedarikçi portalı EN dil —
  **SQLite ve PostgreSQL production build üzerinde 8/8**.
- **E2E — backend/entegrasyon ile doğrulanan adımlar (tarayıcıda değil):** teklif karşılaştırma→split award→
  otomatik PO→kısmi mal kabul→fatura→**üçlü eşleştirme (tolerans içi kabul / dışı bloke)**;
  `full-chain.test.ts` + `invoice-matching.test.ts` içinde gerçek kayıt/hesapla doğrulanır. Ayrıntı: [`docs/test-report.md`](docs/test-report.md).

## Kalan işler (yalnızca harici hesap/altyapı gerektirenler)

Uygulama içi tüm modüller tamam (create/edit/detay çalışıyor, liste-only modül yok). Kalan maddeler
yalnızca dış sistem/hesap gerektirir:

- **Harici hesap gerektirenler** (adapter + mock/local mod hazır): ERP, e-Fatura, SSO, AI, virüs tarama.
- **PostgreSQL prod dağıtımı**: şema + `db push`/migration doğrulandı, seed + build + **E2E 8/8** PG'de geçti;
  prod'da yalnızca servis yönetimi + secret (env) kurulumu kalır.
- **i18n**: paylaşılan yüzeyler (menü/aksiyon/ortak etiket/auth/durumlar) merkezî sözlükte, tr/en **parite testli**.
  Uygulama Türkçe-önceliklidir; gövde metinleri varsayılan dil olarak Türkçe, altyapı aşamalı çıkarıma hazır.

## Önemli notlar

- Excel kaynak dosyası **değiştirilmedi**; gerçek import **çalıştırıldı ve mutabık** (batch `cms48jnjf...`).
  Kontrollü geri alma mevcut (Entegrasyon Merkezi → İçe Aktarma ekranı).
- Bu makinede kurulu: **Node 24, Git, PostgreSQL 16** (native, `C:\Users\Aykut\pgdata`, port 5432).
  Docker/WSL2 kurulu değil (WSL2 reboot gerektirdiği için native PG tercih edildi).
- **Dev veritabanı SQLite** (`prisma/dev.db`, import verisi burada). PostgreSQL doğrulama için kullanıldı,
  sonra SQLite'a dönüldü. PG servisini başlatmak için:
  `& "C:\Program Files\PostgreSQL\16\bin\pg_ctl" -D C:\Users\Aykut\pgdata start`
- Yedekler `prisma/backups/` (gitignore'da). Kaynak Excel `Downloads` ve proje kökünde (gitignore'da).

## Nasıl doğrulanır (yeniden çalıştırma)

```powershell
cd C:\Users\Aykut\coil-procurement-hub
npm run typecheck   # 0 hata
npm run lint        # 0 hata/uyarı
npm test            # 80 test (unit+integration)
npm run build       # temiz (41 route)
npx playwright test # 8 E2E (SQLite; PG için provider=postgresql + PG server)
npm run dev         # http://localhost:3000
```
