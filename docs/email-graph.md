# Microsoft 365 / Graph E-posta Kurulumu

Uygulama, RFQ ve sipariş e-postalarını Microsoft Graph üzerinden gönderebilir (uygulama izinli, kullanıcı etkileşimi olmadan).

## 1. Azure uygulama kaydı

1. **Azure Portal → Microsoft Entra ID → App registrations → New registration**.
2. Adı: `Coil Procurement Hub Mailer`. Kaydı oluşturun.
3. **Certificates & secrets → New client secret** → değeri kopyalayın (`MS_GRAPH_CLIENT_SECRET`).
4. **API permissions → Add a permission → Microsoft Graph → Application permissions → `Mail.Send`** → ekleyin ve **Grant admin consent**.
5. **Overview**'den `Application (client) ID` (`MS_GRAPH_CLIENT_ID`) ve `Directory (tenant) ID` (`MS_GRAPH_TENANT_ID`) değerlerini alın.

> `Mail.Send` uygulama izni, kiracıdaki tüm posta kutularından gönderime izin verir. Güvenlik için **Application Access Policy** ile yalnızca gönderici hesabı kısıtlanmalıdır.

## 2. .env

```env
EMAIL_PROVIDER="graph"
EMAIL_FROM="satinalma@coilpartners.com"
EMAIL_FROM_NAME="Coil Procurement Hub"
MS_GRAPH_TENANT_ID="..."
MS_GRAPH_CLIENT_ID="..."
MS_GRAPH_CLIENT_SECRET="..."
MS_GRAPH_SENDER_UPN="satinalma@coilpartners.com"
```

## 3. Gelen yanıtlar (inbound)

Gelen tedarikçi yanıtlarını RFQ'ya bağlamak için iki yöntem:

- **Reply-To token (önerilen):** Uygulama her davete `rfq+<token>@EMAIL_INBOUND_DOMAIN` Reply-To ekler. Bir Graph subscription (webhook) veya Power Automate akışı, gelen postayı `POST /api/email/inbound`'a iletmelidir.
- **Konu satırı:** `[RFQ-YYYY-NNNNNN]` referansı otomatik tanınır.

Eşleşmeyen postalar "eşleştirme bekleyen" kuyruğuna alınır (E-posta Merkezi).

## SPF / DKIM / DMARC

Bkz. [`email-smtp.md`](email-smtp.md#spf-dkim-dmarc). M365 için DKIM'i Microsoft 365 Defender portalından etkinleştirin.
