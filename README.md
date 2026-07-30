# Coil Procurement Hub

Kurumsal **Satınalma ve Tedarikçi Yönetim Platformu** — Talep → Onay → Teklif Talebi (RFQ) → Tedarikçi Teklifi (magic-link) → Karşılaştırma → Sipariş → Mal Kabul → Fatura akışını uçtan uca yöneten, çok şirketli, çift dilli (TR/EN), rol bazlı yetkilendirmeye sahip bir uygulamadır.

> SAP Ariba / Coupa / Ivalua benzeri bir kurumsal satınalma platformunun çalışan çekirdeği. Yurt içi, ithalat ve ihracat bağlantılı satınalma operasyonlarını ayrı ayrı destekler.

---

## İçindekiler

- [Öne çıkan özellikler](#öne-çıkan-özellikler)
- [Teknoloji yığını](#teknoloji-yığını)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Demo giriş bilgileri](#demo-giriş-bilgileri)
- [Uçtan uca akışı deneme](#uçtan-uca-akışı-deneme)
- [Mimari](#mimari)
- [Testler](#testler)
- [Ortam değişkenleri](#ortam-değişkenleri)
- [Üretime alma](#üretime-alma)
- [Dokümantasyon](#dokümantasyon)
- [Bilinen sınırlamalar](#bilinen-sınırlamalar-ve-sonraki-adımlar)

---

## Öne çıkan özellikler

- **Tam satınalma döngüsü:** Talep → çok adımlı onay → RFQ → tedarikçi teklifi → karşılaştırma → karar (split award) → otomatik sipariş → mal kabul → fatura üçlü eşleştirme.
- **Onay motoru:** Tutar, kategori, şirket, proje, operasyon türü, aciliyet ve risk seviyesine göre yapılandırılabilir çok adımlı onay akışları. Görevler ayrılığı (kişi kendi belgesini onaylayamaz) ve **vekâlet** desteği.
- **Tedarikçi magic-link portalı:** Tedarikçinin platformda hesabı olması zorunlu değildir. E-postadaki güvenli, süreli, tek kullanımlık bağlantı ile teklif verir. **TR/EN dil değiştirici** portalda yerleşiktir. Teklif kalemleri **kalem bazlı para birimi**, Türkiye-geçerli KDV seçimi ve tedarikçinin kayıtlı vadesine göre otomatik ödeme vadesi ile girilir.
- **Kalem bazlı fotoğraf/görsel:** Talep açan kişi kaleme fotoğraf/dosya ekler (talep açılırken veya detayda); bu görseller **tedarikçinin teklif sayfasında** kalem altında görünür — doğru ürün için net teklif.
- **Kalite / bobin testleri:** Mal kabul kalite kontrolünde düzenlenebilir test tablosu (test/metot/spesifikasyon/ölçüm/sonuç) + test raporu ve numune fotoğrafı ekleme; uygunsuzluk (NCR) ve CAPA/8D yönetimi.
- **Gerçek e-posta altyapısı:** Sağlayıcı soyutlaması (mock / SMTP / Microsoft Graph / SendGrid / SES), kuyruklama, yeniden deneme, teslim logları. Gelen yanıtları benzersiz Reply-To token'ı veya konu satırındaki RFQ numarası ile doğru RFQ'ya eşleştirme.
- **Çok şirketli & çok lokasyonlu:** Tenant izolasyonu, RBAC + kayıt bazlı kapsam (16 rol).
- **Çift dil (TR/EN) baştan tasarlanmış i18n:** Merkezi sözlükler, `t()`, yerele duyarlı sayı/para/tarih biçimlendirme, **Türkçe karakter uyumlu sıralama ve arama**, tedarikçinin tercih ettiği dile göre otomatik e-posta dili. Eksik çeviri anahtarları testle denetlenir.
- **Operasyon türleri:** `DOMESTIC_PURCHASE` (yurt içi), `IMPORT_PURCHASE` (ithalat), `EXPORT_RELATED_PURCHASE` (ihracat bağlantılı) — talep, RFQ, sipariş, onay kuralları ve raporlarda kullanılır.
- **İthalat & landed cost:** Çoklu para birimi, Incoterm, ödeme şekli (LC/CAD/havale…), taşıma modu, forwarder, gümrük müşaviri; **landed cost'un miktar/ağırlık/hacim/değer bazında satırlara dağıtımı**.
- **Güvenli finansal hesaplama:** Tüm para/miktar aritmetiği `decimal.js` ile; hiçbir yerde floating-point yok. Değerler decimal-as-string olarak saklanır.
- **Denetim izi:** Değişmez (append-only) audit log; kullanıcı, zaman, IP, önceki/yeni değer.
- **Durum makineleri:** Talep, RFQ, sipariş, fatura ve tedarikçi için geçersiz durum geçişleri **backend'de** engellenir.
- **Güvenlik:** httpOnly oturum cookie'leri, bcrypt parola, TOTP MFA (RFC 6238, harici bağımlılık yok), hesap kilitleme, hız sınırlama, güvenlik başlıkları, magic-link/token hash'leme.

---

## Teknoloji yığını

| Katman | Teknoloji |
|---|---|
| Framework | Next.js 15 (App Router), React 19 |
| Dil | TypeScript (strict) |
| ORM / DB | Prisma 6 · SQLite (dev) / PostgreSQL (prod) |
| Kimlik | Özel güvenli oturum (httpOnly cookie + bcrypt + TOTP MFA) |
| UI | Tailwind CSS 3, shadcn-tarzı bileşenler, lucide ikonlar |
| Form/Doğrulama | React Hook Form + Zod |
| Para | decimal.js |
| E-posta | nodemailer + sağlayıcı adapter'ları |
| Test | Vitest (birim/entegrasyon), Playwright (E2E) |

> **Neden dev'de SQLite?** Sıfır kurulumla anında çalışması için. Şema PostgreSQL'e taşınabilir yazılmıştır (enum/Decimal/JSON, uygulama katmanında string olarak modellenir). Prod'a geçiş için tek satır: `datasource db { provider = "postgresql" }`.

---

## Hızlı başlangıç

Gereksinim: **Node.js 20+** (bu proje Node 24 ile test edilmiştir). Docker/PostgreSQL gerekmez.

```bash
# 1) Bağımlılıklar
npm install

# 2) Ortam değişkenleri
cp .env.example .env          # Windows: copy .env.example .env

# 3) Veritabanı şeması + demo veri
npm run db:push               # şemayı SQLite'a uygular
npm run db:seed               # demo veriyi yükler

# 4) Geliştirme sunucusu
npm run dev                   # http://localhost:3000
```

Üretim derlemesi:

```bash
npm run build && npm start
```

---

## Demo giriş bilgileri

Tüm demo kullanıcıların parolası: **`Coil2026!`**

| E-posta | Rol |
|---|---|
| `admin@coilpartners.com` | Sistem Yöneticisi |
| `satinalma.md@coilpartners.com` | Satınalma Müdürü |
| `satinalma@coilpartners.com` | Satınalma Uzmanı |
| `talep@coilpartners.com` | Talep Sahibi |
| `amir@coilpartners.com` | Departman Amiri |
| `finans@coilpartners.com` | Finans Onaycısı |
| `depo@coilpartners.com` | Depo Kullanıcısı |
| `kalite@coilpartners.com` | Kalite Kullanıcısı |
| `muhasebe@coilpartners.com` | Muhasebe Kullanıcısı |

> **Üretim güvenliği:** Seed, `NODE_ENV=production` iken çalışmaz (`ALLOW_PROD_SEED=true` ile bilinçli olarak zorlanmadıkça). Demo kullanıcılar üretime taşınmaz.

---

## Uçtan uca akışı deneme

1. **Talep sahibi** (`talep@`) ile giriş yap → **Talepler → Yeni Talep** → kalem ekle → *Kaydet ve Onaya Gönder*.
2. **Departman amiri** (`amir@`) ile giriş → **Onaylarım** → talebi onayla.
3. **Satınalma müdürü** (`satinalma.md@`) → **Onaylarım** → onayla (talep `APPROVED` olur).
4. **Satınalma uzmanı** (`satinalma@`) → talep detayında **Teklif Talebi (RFQ) Oluştur**.
5. RFQ detayında **tedarikçileri seç → gönder**. E-postalar (mock modda) **E-posta Merkezi**'nde ve konsolda görünür. Her tedarikçiye özel magic-link üretilir.
6. Magic-link'i açmak için: E-posta Merkezi'ndeki gönderiyi ya da konsol logunu kullan; `/teklif/<token>` sayfasında tedarikçi teklifini girer (TR/EN değiştirilebilir).
7. Uzman/müdür RFQ'yu **Değerlendirmeye** alır, karşılaştırma tablosunda satır bazında tedarikçi seçer (en düşük fiyat işaretlidir; seçilmezse gerekçe zorunlu), **Kararı onaylar → sipariş otomatik oluşur**.
8. **Siparişler** → sipariş detayında onaya gönder, onayla, tedarikçiye gönder.

> Not: Mock e-posta modunda gerçek e-posta gönderilmez; içerik veritabanına ve konsola yazılır. Gerçek gönderim için `EMAIL_PROVIDER` değerini `smtp`/`graph`/`sendgrid` yapıp ilgili değişkenleri doldurun (bkz. `docs/`).

---

## Mimari

Katmanlı, modüler monolit — ileride servislere ayrılabilecek temiz sınırlar:

```
src/
  app/               # Next.js App Router (UI + server actions + API rotaları)
    (auth)/          # giriş, parola sıfırlama
    (app)/           # kimlik korumalı uygulama (dashboard, modüller)
    teklif/[token]/  # tedarikçi magic-link portalı (public)
    api/             # health, gelen e-posta webhook
  components/        # UI bileşenleri, kabuk (sidebar/topbar), i18n provider
  domain/            # iş kuralları: approval, state-machines, numbering,
                     #   bidding, landed-cost, operations
  lib/               # db, auth, rbac, money, audit, email, storage, i18n, env
prisma/              # schema.prisma, seed.ts
tests/               # unit, integration, e2e
docs/                # kurulum ve mimari kılavuzları + diyagramlar
```

Ayrıntı: [`docs/architecture.md`](docs/architecture.md) · Süreç akışı: [`docs/process-flow.md`](docs/process-flow.md) · ER diyagramı: [`docs/er-diagram.md`](docs/er-diagram.md) · Rol matrisi: [`docs/role-matrix.md`](docs/role-matrix.md)

---

## Testler

```bash
npm test          # Vitest birim/entegrasyon testleri (80 test)
npm run test:e2e  # Playwright E2E (8 test) — SQLite ve PostgreSQL üzerinde 8/8
npm run typecheck # TypeScript tip kontrolü (0 hata)
npm run lint      # ESLint (0 hata/uyarı)
```

Kapsam: güvenli para aritmetiği, durum makineleri, RBAC yetki matrisi, landed cost dağıtımı, **i18n tr/en parite denetimi** (+ mojibake regresyon guard), OTIF/çevrim/tasarruf metrik motorları, üçlü eşleştirme toleransı; E2E'de talep→onay→onay→RFQ zinciri, tedarikçi & kullanıcı oluşturma (gerçek server action + DB doğrulama), giriş→dashboard, hatalı parola reddi, magic-link token reddi, portal dil değiştirme. **Aynı E2E paketi hem SQLite hem PostgreSQL production build üzerinde 8/8 geçer.** Test raporu: [`docs/test-report.md`](docs/test-report.md).

---

## Ortam değişkenleri

Tümü `.env.example` içinde açıklanmıştır. Öne çıkanlar:

| Değişken | Açıklama |
|---|---|
| `DATABASE_URL` | Dev: `file:./dev.db` · Prod: PostgreSQL bağlantısı |
| `AUTH_SECRET` | En az 32 karakter rastgele gizli anahtar |
| `EMAIL_PROVIDER` | `mock` \| `smtp` \| `graph` \| `sendgrid` \| `ses` |
| `EMAIL_INBOUND_DOMAIN` | Gelen yanıt eşleştirme için Reply-To domaini |
| `STORAGE_PROVIDER` | `local` \| `s3` |
| `EXCHANGE_RATE_PROVIDER` | `mock` \| `tcmb` \| `manual` |
| `MAGIC_LINK_TTL_HOURS` | Tedarikçi teklif bağlantısı geçerlilik süresi |

---

## Üretime alma

Özet (ayrıntı: [`docs/deployment.md`](docs/deployment.md)):

1. `docker compose up -d db` ile PostgreSQL'i ayağa kaldır.
2. `.env` içinde `DATABASE_URL`'i PostgreSQL'e çevir, `datasource` provider'ı `postgresql` yap.
3. `npx prisma migrate deploy` (veya ilk kurulumda `prisma db push`).
4. `docker compose up -d --build app`.
5. Sağlık kontrolü: `GET /api/health`.

Yedekleme/geri yükleme: [`docs/backup-restore.md`](docs/backup-restore.md).

---

## Dokümantasyon

| Belge | İçerik |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Katmanlar, modüller, mimari diyagram |
| [`docs/er-diagram.md`](docs/er-diagram.md) | Veritabanı ER diyagramı (Mermaid) |
| [`docs/process-flow.md`](docs/process-flow.md) | Satınalma süreç akışı + durum makineleri |
| [`docs/role-matrix.md`](docs/role-matrix.md) | Rol ve yetki matrisi |
| [`docs/email-graph.md`](docs/email-graph.md) | Microsoft 365 / Graph kurulumu |
| [`docs/email-smtp.md`](docs/email-smtp.md) | SMTP / Gmail / SendGrid + SPF/DKIM/DMARC |
| [`docs/storage-s3.md`](docs/storage-s3.md) | S3 uyumlu dosya depolama |
| [`docs/erp-adapter.md`](docs/erp-adapter.md) | ERP adapter geliştirme kılavuzu |
| [`docs/security-checklist.md`](docs/security-checklist.md) | Güvenlik kontrol listesi |
| [`docs/deployment.md`](docs/deployment.md) | Üretim dağıtım kılavuzu |
| [`docs/postgres-migration.md`](docs/postgres-migration.md) | SQLite → PostgreSQL geçiş ve yapılandırma kılavuzu |
| [`docs/backup-restore.md`](docs/backup-restore.md) | Yedekleme / geri yükleme |
| [`docs/test-report.md`](docs/test-report.md) | Test raporu |

---

## Bilinen sınırlamalar ve sonraki adımlar

Uygulama içi tüm modüller **create/edit/detay ile tam çalışır**: talep, onay, RFQ, tedarikçi teklifi,
karşılaştırma/karar, sipariş, **mal kabul** (kısmi/çoklu, miktar validasyonu), **kalite + NCR/CAPA/8D**,
**fatura girişi + üçlü eşleştirme** (tolerans içi kabul / dışı bloke + istisna onayı), **PDF üretimi**
(sipariş, RFQ, RFQ karşılaştırma, mal kabul, NCR, rapor, tedarikçi — pdfkit, Türkçe font), **raporlar**
(harcama/operasyon/tedarikçi kırılımı + OTIF/çevrim süresi/onay bekleme/tasarruf — veri yetersizse
"veri yetersiz" gösterir), **sözleşme / bütçe / katalog / tedarikçi / kullanıcı CRUD**, gerçek bütçe
rezervasyonu/kontrolü. Liste-only modül, ölü bağlantı veya placeholder **yoktur**.

Gerçekten kalan maddeler yalnızca **harici sistem/hesap** veya **üretim operasyonu** gerektirir:

- **Harici entegrasyonlar** (adapter + mock/local mod hazır; sağlayıcı anahtarı girilince etkinleşir):
  ERP (SAP/Logo/Netsis), e-Fatura/e-Arşiv, SSO (Entra ID/Google/OIDC/SAML), TCMB kur, AI öneri/özet,
  ClamAV virüs tarama, S3 uyumlu depolama.
- **İngilizce arayüz — kısmi.** Paylaşılan yüzeyler (menü, aksiyonlar, ortak etiketler, kimlik doğrulama,
  doğrulama mesajları, durum etiketleri, operasyon türleri, **tedarikçi portalı**, e-postalar) iki dillidir
  ve **tr/en parite testiyle** korunur. Uygulama Türkçe-önceliklidir; bazı iç ekranların **gövde metinleri
  hâlâ Türkçedir** ve merkezî sözlüğe taşınmamıştır. Yani tam İngilizce arayüz henüz tamamlanmamıştır.
- **Tedarikçi self-servis onboarding sihirbazı.** Admin tarafı tedarikçi CRUD tamamdır;
  `Supplier.onboardingToken` altyapısı hazırdır ancak tedarikçinin kendi kartını token ile doldurduğu
  self-servis form akışı henüz yoktur.
- **Üretim sertleştirmesi:** sıkı CSP (nonce), HSTS (reverse proxy), webhook imza doğrulaması,
  Redis tabanlı hız sınırı + kalıcı e-posta kuyruğu worker'ı, hassas alan (banka) şifreleme + secret
  yöneticisi, KVKK/GDPR anonimleştirme/saklama akışları.

Tam liste: [`docs/known-limitations.md`](docs/known-limitations.md).
