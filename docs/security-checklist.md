# Güvenlik Kontrol Listesi

## Kimlik & oturum
- [x] Parolalar **bcrypt** (12 tur) ile hash'lenir.
- [x] Oturumlar httpOnly, `SameSite=Lax`, prod'da `Secure` cookie; DB'de token **hash'lenerek** saklanır.
- [x] **TOTP MFA** (RFC 6238, harici bağımlılık yok) desteği.
- [x] Başarısız giriş sayacı ve **hesap kilitleme** (5 deneme / 15 dk).
- [x] Parola politikası (min 8, harf+rakam).
- [x] Parola sıfırlama tek kullanımlık, süreli, hash'li token; kullanıcı numaralandırması engellenir.

## Yetkilendirme
- [x] **RBAC** + kayıt bazlı kapsam; kontroller backend'de (`requirePermission`).
- [x] **Tenant izolasyonu** her sorguda `tenantId`.
- [x] Görevler ayrılığı (kendi belgeni onaylayamama), vekâlet loglaması.

## Girdi & çıktı
- [x] Tüm girdiler **Zod** ile doğrulanır.
- [x] React varsayılan çıktı kodlaması (XSS koruması).
- [x] Prisma parametreli sorgular (SQL injection koruması).
- [x] Kritik hesaplar (fiyat, KDV, toplam, durum geçişi) **backend'de** doğrulanır.

## Ağ & başlıklar
- [x] Güvenlik başlıkları (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) — `next.config.mjs` + `middleware.ts`.
- [x] **Hız sınırlama** (/api ve /login) — dev in-memory; prod'da Redis önerilir.
- [ ] **CSP** — sıkı Content-Security-Policy prod'da eklenmeli (nonce tabanlı).
- [ ] HTTPS/HSTS — reverse proxy (Nginx/Traefik) seviyesinde zorunlu kılın.

## Magic link & webhook
- [x] Tedarikçi magic-link **tek kullanımlık, süreli, hash'li** token.
- [x] Gelen e-posta benzersiz Reply-To token'ı ile eşleşir.
- [ ] Webhook **imza doğrulaması** (sağlayıcıya göre) prod'da eklenmeli.

## Veri & denetim
- [x] **Değişmez audit log** (append-only): kullanıcı, zaman, IP, önceki/yeni değer, correlation ID alanları.
- [x] Mükerrer fatura engeli (`@@unique`), tedarikçi banka değişikliğinde çift onay alanları.
- [x] Finansal/denetim kayıtları fiziksel silinmez (soft delete yalnızca uygun tablolarda).
- [ ] Hassas alan şifreleme (banka bilgileri) — prod'da alan düzeyinde şifreleme eklenebilir.
- [ ] Dosya **virüs tarama** (ClamAV) — `ANTIVIRUS_PROVIDER=clamav` ile etkinleştirilir.

## Secrets
- [x] Secrets `.env` (git'e girmez); `.env.example` şablonu.
- [ ] Üretimde secret yöneticisi (Azure Key Vault / AWS Secrets Manager) önerilir.

## KVKK / GDPR
- [x] Veri dışa aktarma (liste ekranları CSV/Excel/PDF'e uygun tasarım).
- [ ] Anonimleştirme/silme talebi akışları ve saklama politikası zamanlayıcıları eklenebilir (veri modeli hazır).

> `[ ]` işaretli maddeler üretim sertleştirmesi için önerilen adımlardır; altyapı/arayüz hazırdır.
