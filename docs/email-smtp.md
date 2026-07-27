# SMTP / Gmail / SendGrid E-posta Kurulumu

## SMTP (genel / kurumsal sunucu)

```env
EMAIL_PROVIDER="smtp"
EMAIL_FROM="satinalma@coilpartners.com"
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_SECURE="false"   # 465 için "true"
SMTP_USER="satinalma@coilpartners.com"
SMTP_PASS="uygulama-parolasi"
```

## Gmail / Google Workspace

- **App Password (2FA gerekli):** Google Hesap → Güvenlik → Uygulama şifreleri. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`.
- **Gmail API (OAuth):** Kurumsal senaryoda önerilir; adapter `graph`/`sendgrid` gibi genişletilebilir (bkz. `src/lib/email/provider.ts`).

## SendGrid

```env
EMAIL_PROVIDER="sendgrid"
SENDGRID_API_KEY="SG...."
EMAIL_FROM="satinalma@coilpartners.com"
```

SendGrid'de **Sender Authentication** (domain) tamamlanmalı, gelen yanıtlar için **Inbound Parse** webhook'u `POST /api/email/inbound`'a yönlendirilmelidir.

## Amazon SES

SES için SMTP arayüzü kullanılır (`EMAIL_PROVIDER="ses"` → SMTP kimlik bilgileri). Sandbox'tan çıkış ve domain doğrulaması gereklidir.

## SPF / DKIM / DMARC

Gönderimlerin spam'e düşmemesi için gönderici domaininde:

- **SPF:** `v=spf1 include:<sağlayıcı> ~all`
- **DKIM:** Sağlayıcının verdiği CNAME/TXT kayıtları (M365, SendGrid, SES kendi anahtarını üretir).
- **DMARC:** `v=DMARC1; p=quarantine; rua=mailto:dmarc@coilpartners.com`

## Kuyruk, yeniden deneme ve teslim takibi

Tüm giden e-postalar `EmailMessage` olarak kuyruğa alınır; `processQueue()` gönderir, başarısızlıkta 3 denemeye kadar yeniden dener, sonra `BOUNCED` (dead-letter) olur. Durumlar **E-posta Merkezi**'nde ve `EmailEvent` kayıtlarında izlenir.
