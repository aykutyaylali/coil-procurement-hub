# ERP Adapter Geliştirme Kılavuzu

Entegrasyonlar adapter tabanlıdır; işler `IntegrationJob` olarak izlenir (idempotent, yeniden çalıştırılabilir).

## Desteklenen konnektör hedefleri

SAP · Microsoft Dynamics · Logo · Netsis · Uyumsoft/Uyumcloud · GirişTicari · BulutMES · özel REST/SOAP · CSV/Excel · Webhooks · SFTP.

## Adapter arayüzü (önerilen şablon)

```ts
export interface ErpAdapter {
  readonly connector: string;
  // Dışa: kartları/işlemleri ERP'ye gönder
  pushSuppliers(items: SupplierDTO[]): Promise<IntegrationResult>;
  pushPurchaseOrders(items: PoDTO[]): Promise<IntegrationResult>;
  // İçe: ERP'den çek
  pullItems(): Promise<ItemDTO[]>;
  pullExchangeRates(): Promise<RateDTO[]>;
}
```

## İdempotentlik

Her iş için `IntegrationJob.idempotencyKey` (ör. `PO:{poId}:{revision}`) benzersizdir. Aynı anahtar iki kez işlenmez. Başarısız işler yeniden çalıştırılabilir; sonuç/hata `IntegrationJob.result` / `errorText`'te saklanır.

## Döviz kuru (TCMB)

`EXCHANGE_RATE_PROVIDER=tcmb` için TCMB günlük XML'inden (`https://www.tcmb.gov.tr/kurlar/today.xml`) çekim yapan bir adapter yazın; kullanılan kur ve kaynak `ExchangeRate` kaydına yazılır. Manuel kur kullanılırsa `reason` ve `createdBy` saklanır.

## e-Fatura / e-Arşiv

`Invoice.source = "EINVOICE"` ile gelen faturalar entegrasyon işiyle oluşturulur; PO–Mal Kabul–Fatura üçlü eşleştirmesi otomatik tetiklenir. Tolerans dışı faturalar `BLOCKED` olur.

## Adım adım yeni adapter

1. `src/integrations/<connector>/adapter.ts` içinde `ErpAdapter` implement edin.
2. Kimlik bilgilerini `.env`'e ekleyin ve `src/lib/env.ts` şemasına tanımlayın.
3. Bir server action veya zamanlanmış job ile çağırın; her çağrıda `IntegrationJob` oluşturup güncelleyin.
4. Entegrasyon Merkezi ekranından durum/hata/yeniden çalıştırma izlenir.
