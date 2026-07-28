# Bilinen Sınırlamalar ve Sonraki Adımlar

Bu proje, kurumsal bir satınalma platformunun **çalışan, üretim mimarisine sahip çekirdeğidir**. Aşağıda şartnameye göre durum haritası verilmiştir.

## Tam çalışan (uçtan uca)

- Kimlik doğrulama, oturum, MFA altyapısı, hesap kilitleme, parola sıfırlama.
- RBAC (16 rol) + kayıt bazlı kapsam; tenant izolasyonu.
- **Talep → çok adımlı onay → RFQ → tedarikçi magic-link teklifi → karşılaştırma → karar (split award) → otomatik sipariş → sipariş onay/gönderim.**
- Onay motoru (koşullu kurallar, görevler ayrılığı, vekâlet).
- Gerçek e-posta altyapısı (mock/SMTP/Graph/SendGrid/SES), kuyruk, yeniden deneme, gelen eşleştirme, E-posta Merkezi.
- Çift dil (TR/EN) i18n mimarisi; tedarikçi portalı ve e-postalarda dil; Türkçe sıralama/arama; yerele duyarlı biçimler.
- Operasyon türü ayrımı (yurt içi/ithalat/ihracat bağlantılı) — form, onay, sipariş, rapor.
- İthalat alanları + landed cost dağıtımı (miktar/ağırlık/hacim/değer).
- Güvenli decimal finans, durum makineleri, değişmez audit log.
- Tüm ana modüller için gerçek veri okuyan liste/detay ekranları (ölü bağlantı yok).
- Dashboard (rol bazlı KPI), raporlar (harcama/operasyon/tedarikçi kırılımı), global arama, denetim, entegrasyon merkezi, yönetim ekranları.
- **Mal kabul:** oluşturma/detay, kısmi/çoklu kabul, disposition, lot-seri-raf, irsaliye, backend miktar validasyonu.
- **Kalite + NCR / CAPA / 8D:** kontrol tamamlama (`completeInspection`), uygunsuzluk (`createNonConformance`/`updateNonConformance`), CAPA/8D (`createCAPA`/`updateCAPA`), tedarikçi performansına etki.
- **Fatura girişi + üçlü eşleştirme:** `createInvoice` + tolerans içi otomatik kabul / tolerans dışı bloke + istisna onayı (`approveInvoiceException`), ödeme durumu.
- **PDF üretimi (pdfkit, Türkçe DejaVu font):** sipariş, RFQ, RFQ karşılaştırma, mal kabul, NCR, rapor, tedarikçi — gerçek route'lar (`.../pdf`).
- **Sözleşme / Bütçe / Katalog / Tedarikçi / Kullanıcı CRUD:** create/edit/detay formları çalışır; gerçek bütçe rezervasyonu/kontrolü (`reserveBudget`/`releaseBudget`) talep yaşam döngüsüne bağlıdır.
- **Operasyonel metrikler:** OTIF, req→sipariş çevrim süresi, onay bekleme, tasarruf — gerçek DB'den hesaplanır; zaman damgası yetersizse "veri yetersiz" gösterir.

## Gerçekten kalan (uygulama içi eksik)

| Alan | Durum |
|---|---|
| **İngilizce arayüz — kısmi** | Paylaşılan yüzeyler (menü/aksiyon/ortak etiket/kimlik/doğrulama/durum/operasyon türü/tedarikçi portalı/e-posta) iki dilli ve **tr/en parite testli**. Uygulama Türkçe-önceliklidir; bazı iç ekranların gövde metinleri hâlâ Türkçedir. **Tam İngilizce arayüz henüz tamamlanmamıştır.** |
| **Tedarikçi self-servis onboarding sihirbazı** | Admin tarafı tedarikçi CRUD tamam; `Supplier.onboardingToken` + durumlar hazır ancak tedarikçinin token ile kendi kartını doldurduğu self-servis akış henüz yok. |

## Entegrasyon arayüzü hazır (anahtar girilince aktif)

SSO (Entra ID/Google/OIDC/SAML) · ERP (SAP/Logo/Netsis/…) · e-Fatura/e-Arşiv · TCMB kur · Teams/Slack bildirim · AI özellikleri (öneri/özet, kullanıcı onaylı) · ClamAV virüs tarama · S3 depolama. Hepsi mock/local modda çalışmaya devam eder; `.env` anahtarları girildiğinde etkinleşir.

## Üretim sertleştirmesi (öneri)

- Sıkı CSP (nonce), HSTS (reverse proxy), webhook imza doğrulaması.
- Redis tabanlı hız sınırı ve kalıcı e-posta kuyruğu worker'ı.
- Hassas alan (banka) şifreleme; secret yöneticisi.
- KVKK/GDPR: anonimleştirme/silme akışları, saklama zamanlayıcıları.

## Bilinçli teknik kararlar

- **Dev'de SQLite:** sıfır kurulumla çalışması için. Şema PostgreSQL'e taşınabilir (enum/Decimal/JSON → string). Prod geçişi: tek satır provider + `migrate deploy`.
- **Özel oturum katmanı** (NextAuth yerine): şartnamenin "güvenli eşdeğer" izniyle, tam kontrol ve bağımsızlık için.
