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

## Veri modeli + arayüz hazır, genişletilecek

| Alan | Durum |
|---|---|
| Mal kabul / kalite giriş formları | Liste ekranları çalışır; ayrıntılı kabul/NCR/8D/CAPA giriş formları eklenecek. Veri modeli tam. |
| Fatura girişi + üçlü eşleştirme ekranı | Liste + veri modeli (`InvoiceMatch`, tolerans) hazır; giriş/istisna onay ekranı eklenecek. |
| PDF üretimi (sipariş/RFQ, TR/EN) | Servis arayüzü tasarlandı; markalı PDF render'ı eklenecek. Logo: `public/brand/coil-logo.pdf` (web için PNG/SVG önerilir). |
| Tedarikçi onboarding sihirbazı | `Supplier.onboardingToken` + durumlar hazır; self-servis form akışı eklenecek. |
| Sözleşme/bütçe düzenleme formları | Liste + model hazır; CRUD formları eklenecek. |
| Bütçe rezervasyon/iptal otomasyonu | `BudgetTransaction` modeli hazır; talep/sipariş yaşam döngüsüne bağlanacak. |

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
