# Coil Procurement Hub — Proje Raporu (Yapay Zekâ Bağlamı)

> Bu rapor, projeyi hiç görmemiş bir yapay zekânın anlayıp görüş verebilmesi için yazıldı.
> Tarih bağlamı: 7. geliştirme oturumu sonu. Uygulama çalışır durumda (production build).

---

## 1. Proje nedir?

**Kurumsal Satınalma ve Tedarikçi Yönetim Platformu** — SAP Ariba / Coupa / Ivalua benzeri
bir sistemin çalışan çekirdeği. Bir bobin/çelik/malzeme alan şirketin tüm satınalma sürecini
uçtan uca yönetir:

**Talep → (Onay) → Teklif Talebi (RFQ) → Tedarikçi Teklifi → Karşılaştırma → Karar (Award) →
Sipariş (PO) → Mal Kabul → Kalite Kontrol → Fatura**

Öne çıkan gerçek-dünya gereksinimleri:
- **Çok şirketli** (multi-tenant + multi-company), **çift dilli (TR/EN)**, **rol bazlı yetki (RBAC, 16 rol)**.
- **Yurt içi / ithalat / ihracat-bağlantılı** satınalma türleri ayrı ayrı desteklenir.
- **Tedarikçinin sisteme üye olması gerekmez**: e-postadaki güvenli, süreli, tek kullanımlık
  **magic-link** ile teklif verir.
- **Çok para birimli** (TRY/USD/EUR/GBP), **kalem bazlı** para birimi; TCMB kurlarıyla TL karşılığı.

## 2. Teknoloji yığını

- **Next.js 15** (App Router), **React 19**, **TypeScript strict**.
- **Server Actions** ağırlıklı (form/mutation için ayrı REST API yok); sunucu-render sekmeler `searchParams` ile.
- **Prisma 6** ORM. Dev: **SQLite** (`prisma/dev.db`), Prod: **PostgreSQL** (provider değişimi yeterli).
- **Özel auth**: httpOnly session cookie, bcrypt, **TOTP MFA**. RBAC `requirePermission`/`userCan` ile.
- **Para birimi**: `decimal.js` tabanlı `src/lib/money.ts` (tutarlar string olarak saklanır — "decimal-as-string").
- **i18n**: `tr.ts`/`en.ts` + parite testi. **PDF**: `pdfkit` + DejaVu fontları (Türkçe karakter).
- **E-posta**: sağlayıcı soyutlaması (mock/SMTP/Microsoft Graph/SendGrid/SES), kuyruk, retry, teslim logu.
- **Dosya depolama**: polimorfik `Attachment` + `LocalStorage`/`S3` soyutlaması, MIME allowlist + virüs-tarama kancası.
- **Kur**: **TCMB** ücretsiz XML API (anahtarsız) — kurlar otomatik çekilir.
- **Test**: Vitest (unit/entegrasyon) + **Playwright** (E2E, 7 dosya).

Komutlar: `npm run dev`, `npm run build`, `npm run prod` (build+start), `npm run db:push`, `npm run db:seed`.

## 3. Mimari kararlar (neden böyle?)

- **Her şey String (decimal-as-string)**: Parasal alanlar `String` + `decimal.js`; float yuvarlama hatası yok.
  Enum'lar sabit string, JSON alanlar string içinde. SQLite↔PostgreSQL taşınabilirliği kolaylaşır.
- **Polimorfik `Attachment`/`Comment`**: `entityType`+`entityId` ile herhangi bir varlığa dosya/yorum bağlanır
  (FK yok). Tek altyapı; her modül tekrar tekrar tablo açmaz.
- **Tenant izolasyonu**: Üst modeller `tenantId` taşır; alt (satır) modeller parent üzerinden scope edilir.
  Sorgular daima tenant filtreler.
- **Satınalma İşlem Merkezi (case-based UX)**: Talep/RFQ/teklif/sipariş ayrı sayfalardaydı; kullanıcı sürecin
  nerede olduğunu göremiyordu. `src/domain/procurement-case.ts › loadProcurementCase` her talebi bir **dosya**
  olarak toplar (talep+RFQ+teklif+sipariş+mal kabul+fatura + **hesaplanan 9 aşama**). `/islem-merkezi/[id]`
  tek ekranda süreç göstergesi (stepper) + sekmeler. **Mevcut modül/URL'ler bozulmadı** — sadece ilişkilendirilip okunur.
- **Onay opsiyonel**: "Tüm talepler onaya giderse iş yürümez" gerçeğine göre talep onayı **varsayılan KAPALI**
  (NEVER). Yönetim onayı **sipariş (PO) aşamasında opsiyonel**. Politika şirket ayarında THRESHOLD/ALWAYS yapılabilir.

## 4. Veri modeli (özet — tam hali `schema.prisma`, 74 model)

Ana zincir: `PurchaseRequisition` → `RequisitionLine` → `RFQ` → `RFQLine` (→ `requisitionLineId`) →
`RFQSupplier` (magic-link) → `Bid` → `BidLine` → `AwardDecision` → `PurchaseOrder` → `PurchaseOrderLine` →
`GoodsReceipt` → `QualityInspection` → `NonConformance`/`CAPA` → `Invoice`.

Yardımcı: `Supplier`(+contacts, risk, performans), `Category`, `Company`/`Department`/`CostCenter`/`Project`,
`ApprovalWorkflow`/`ApprovalInstance`, `Notification`, `AuditLog`, `Attachment`, `Comment`, `ExchangeRate`.

Önemli alanlar:
- `Bid.source` = PORTAL | MANUAL | EMAIL (satınalma tedarikçi adına da girebilir).
- `BidLine.currency` = kalem bazlı para birimi.
- `RFQLine.requisitionLineId` = teklif↔talep izlenebilirliği (award sonrası talep ORDERED olur).
- `QualityInspection.testsJson` = bobin test tablosu (test/metot/spec/ölçüm/sonuç) JSON.

## 5. Güncel durum — ne çalışıyor?

Uçtan uca akış çalışır ve E2E ile test edilir:
- Talep aç (fiyat/PB/KDV **girilmez** — talep açan bilmez), kategori AI önerisi (ücretsiz/yerel), **kalem foto ekleme**.
- Talebi kalemlere göre **ayrı RFQ'lara bölme** (farklı tedarikçi/kategori).
- RFQ'yu tedarikçiye e-posta + magic-link ile gönderme; **satınalma önizleme + tedarikçi adına teklif girme/düzeltme**.
- Teklif formu: kalem bazlı PB, TR-geçerli KDV (0/1/10/20), tedarikçi vadesinden otomatik ödeme vadesi, **talep kalem fotoğrafları görünür**.
- **Sütun bazlı karşılaştırma** + rozetler + TL karşılığı + **2 aşamalı karar** + split award → otomatik sipariş(ler).
- Sipariş: **tek-tıkla Onayla+Gönder**, **logolu PDF**, mal kabul + goods receipt.
- **Kalite**: bobin test tablosu + test raporu/fotoğraf, NCR/CAPA.
- Faturalar, bütçeler, raporlar, e-posta merkezi, denetim günlüğü.

Veri: Kullanıcının gerçek Excel verisi (talepler, tedarikçiler, siparişler, mal kabuller) içeri aktarıldı;
demo/deneme verileri temizlendi. Yalnızca gerçek veriyle çalışıyor.

## 6. Bilinen sınırlamalar / açık konular (görüş almak için ideal)

- **Kalite modülü** yeni büyütüldü; bobin testleri için standart kütüphanesi/limit doğrulama yok (serbest metin).
- **Çok para birimli karşılaştırma** TL'ye TCMB kuruyla çevrilir; karar anındaki kur kilidi/forward-rate yok.
- **AI kategori önerisi** yerel/kural-tabanlı (ücretsiz); LLM tabanlı öneri opsiyonu yok.
- **Dosya depolama** dev'de yerel disk; S3 sağlayıcısı stub (prod'da doldurulmalı).
- **Tedarikçi portalı** tek teklif turu + revizyon; müzakere/ihale turları sınırlı.
- Ölçek/performans: SQLite dev içindir; prod PostgreSQL + indeks/gözden geçirme gerekebilir.

## 7. Yapay zekâya sorulabilecek örnek sorular

1. Bu mimaride ölçeklenince ilk kırılacak yer neresi? Somut refactor önerisi.
2. Teklif karşılaştırma/karar (award) UX'ini ve veri modelini nasıl geliştirirsin?
3. Çok para birimli teklif karşılaştırmasında hangi finansal tuzaklar var (kur kilidi, vade, navlun)?
4. Kalite/bobin testleri modülü için sektörel en iyi uygulama nedir (standartlar, limitler, sertifika)?
5. Bu ürünü gerçek müşteriye satmadan önce kapatılması gereken 5 kritik boşluk?
6. Güvenlik: multi-tenant izolasyon + magic-link + dosya yükleme yüzeyinde risk değerlendirmesi.
