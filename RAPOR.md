# Coil Procurement Hub — Çalışma Raporu

> Bu dosya yapılan her şeyin güncel özetidir. Her önemli aşamada güncellenir.
> Son güncelleme: geliştirme oturumu (bilgisayar kapatma öncesi ara kayıt).

## Genel durum

- **Konum:** `C:\Users\Aykut\coil-procurement-hub`
- **Çalıştırma:** `npm run dev` → http://localhost:3000
- **Demo giriş:** `admin@coilpartners.com` / `Coil2026!` (diğer roller README'de)
- **Sağlık:** build **temiz**, TypeScript typecheck **hatasız**, **46 birim testi** geçiyor, 5 E2E geçiyor.
- **Git:** her aşama ayrı commit'li (aşağıda). Kaynak Excel ve yedekler `.gitignore`'da.

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

### Geçmiş Veri İçe Aktarma (commit `8ee23be`)
- Excel motoru + **sihirbaz** (yükle → sütun eşleştirme → özet → uyarılar → dry-run → onay → sonuç → hatalı satır CSV).
- **Dry-run yapıldı ve gösterildi** (gerçek import kullanıcının onayına bırakıldı):
  490 sipariş · 1.032 kalem · 117 yeni tedarikçi · kaynak = içe aktarılacak = **70.435.847,79 ₺ (fark 0)**.
- İdempotent (mevcut sipariş atlanır), otomatik yedek, transaction, **kontrollü geri alma**, audit.
- Kurallar: tarihsel TL ayrı saklanır (yeniden hesaplanmaz), boş fiyat/KDV null (0 ile doldurulmaz),
  tedarikçi/kategori normalize, talep eden geçmiş referans (login oluşturulmaz).

### Faz 2 — Fatura + Üçlü Eşleştirme (commit `c63742a`)
- **matching engine:** PO–Mal Kabul–Fatura satır bazlı miktar/fiyat/vergi farkı + tolerans sonucu
  (MATCHED/OVER_INVOICED/PRICE_VARIANCE/NOT_RECEIVED).
- Fatura oluşturma formu (PO seçimi, mal kabul satırları önden dolu, tevkifat), tolerans dışı → **BLOCKED**
  + istisna onayı (gerekçe zorunlu), **mükerrer engel**, PO `INVOICED` geçişi, 3-way eşleştirme tablosu.

### Faz 2 — PDF Üretimi (commit sırada)
- **pdfkit + DejaVu Türkçe font**; markalı, çift dilli (TR/EN) PDF: **Sipariş, RFQ, Karşılaştırma, Mal Kabul,
  NCR, Tedarikçi Değerlendirme** — indirme rotaları + detay sayfalarında butonlar.
- **Not:** geliştirme sırasında bazı dosyalarda oluşan Türkçe karakter (mojibake) bozulması tespit edildi ve
  **tüm kaynak dosyalarda deterministik onarıldı** (0 kaldı, doğrulandı). PDF başlıkları artık doğru: "SATINALMA SİPARİŞİ", "TEDARİKÇİ".

## Kalan işler (sıradaki oturum)

- **PDF modülünü commit et** (kod hazır, build temiz).
- 6. Raporlar: gerçek hesaplanan metrikler (OTIF, çevrim süresi, tasarruf, landed cost) + çalışan filtreler + CSV/PDF export.
- 5. i18n: kalan yönetim ekranlarındaki metinleri merkezî sözlüğe taşıma + eksik anahtar testi kapsamı.
- 7. Modül denetimi (eksik create/edit, dead link kontrolü).
- 8. **PostgreSQL doğrulaması** (bu makinede Docker/Postgres kurulu değil — kurulup gerçek migrate+seed+test gerekli).
- 9-10. Güvenlik/iş kuralı testleri + tam uçtan uca E2E senaryosu + README "sınırlamalar" güncelleme.

## Önemli notlar

- Excel kaynak dosyası değiştirilmedi; import henüz **çalıştırılmadı** (kullanıcı onayı bekliyor).
- Bu makinede Node 24 + Git kurulu; Docker/PostgreSQL yok.
- Dev sunucusu kapatıldı (bilgisayar kapatılacağı için arka planda process bırakılmadı).
