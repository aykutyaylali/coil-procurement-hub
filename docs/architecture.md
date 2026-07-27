# Mimari

Coil Procurement Hub, ileride servislere ayrılabilecek temiz katman sınırlarına sahip bir **modüler monolit**tir.

## Katmanlar

```mermaid
flowchart TB
  subgraph UI["UI Katmanı (Next.js App Router)"]
    P[Sayfalar / Server Components]
    C[İstemci Bileşenleri]
    SH[Kabuk: Sidebar / Topbar / i18n Provider]
  end
  subgraph API["API / Server Actions"]
    SA[Server Actions]
    RT[REST rotaları: /api/health, /api/email/inbound]
  end
  subgraph DOMAIN["Domain / İş Kuralları"]
    APR[Onay Motoru]
    SM[Durum Makineleri]
    NUM[Numaralandırma]
    BID[Teklif / Bidding]
    LC[Landed Cost]
    OPS[Operasyon Türleri]
  end
  subgraph LIB["Altyapı (lib)"]
    AUTH[Auth + RBAC + Session + MFA]
    MON[Money / decimal.js]
    AUD[Audit Log]
    EMAIL[Email Sağlayıcı Adapter]
    STOR[Storage Adapter]
    I18N[i18n]
  end
  DB[(Prisma · SQLite/PostgreSQL)]

  UI --> API --> DOMAIN --> LIB --> DB
  API --> LIB
  DOMAIN --> DB
```

## İlkeler

- **Yetki her zaman backend'de.** `requirePermission()` / `requireUser()` server action ve sayfalarda uygulanır; frontend kontrolüne asla güvenilmez.
- **Güvenli para.** Tüm parasal/miktar hesapları `src/lib/money.ts` (decimal.js) üzerinden; DB'de decimal-as-string.
- **Durum makineleri.** Geçersiz durum geçişleri `src/domain/state-machines.ts` ile backend'de engellenir.
- **Değişmez denetim.** `AuditLog` yalnızca eklenir (append-only); güncellenmez/silinmez.
- **Tenant izolasyonu.** Her sorgu `tenantId` ile kapsanır; kayıt bazlı kapsam (`UserScope`) ek kısıt sağlar.
- **Adapter tabanlı entegrasyon.** E-posta, depolama, kur, ERP, virüs tarama sağlayıcıları arayüz arkasında; mock/local mod her zaman çalışır.

## Modüller

Talep · RFQ · Teklif · Karşılaştırma/Karar · Sipariş · Lojistik/Mal Kabul · Kalite · Fatura/Eşleştirme · Tedarikçi · Sözleşme · Bütçe · Katalog · Raporlar · E-posta Merkezi · Entegrasyonlar · Denetim · Yönetim.

## İstek yaşam döngüsü (örnek: talebi onaya gönderme)

```mermaid
sequenceDiagram
  participant U as Kullanıcı
  participant SA as Server Action
  participant D as Domain (Approval)
  participant DB as Prisma
  U->>SA: submitRequisition(id)
  SA->>DB: requireUser + talebi getir (tenant kapsamı)
  SA->>D: buildApprovalInstance(kurallar, bağlam)
  D->>DB: uygun kuralı seç, adımları çöz, instance oluştur
  SA->>DB: talep durumu -> PENDING_APPROVAL (transaction)
  SA->>DB: writeAudit(STATUS_CHANGE)
  SA-->>U: sonuç (revalidate)
```
