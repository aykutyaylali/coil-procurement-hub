# UX: Satınalma İşlem Merkezi (Birleşik Dosya Deneyimi)

Satınalmacı süreci teknik modüllere göre değil, **günlük iş akışına göre** yönetir. Her talep bir
**satınalma dosyası (case)**dır; talep → teklif → sipariş → teslimat → fatura tek yerden ilişkilendirilir.

> Mevcut modüller ve URL'ler **korunur** (Talepler, Teklif Talepleri, Siparişler, Mal Kabul, Faturalar…).
> İşlem Merkezi bunları aynı dosya altında ilişkilendirip okur; domain/DB **değişmez**.

## Bilgi mimarisi

```
Satınalma İşlem Merkezi  (/islem-merkezi)
├─ İş kuyrukları (sekme + sayı rozeti)
│   İşlem Bekleyen · RFQ Hazırlanacak · Tedarikçi Yanıtı Bekleyen ·
│   ► Teklif Gelenler (yeşil, sayılı) · Sipariş · Tamamlananlar
│   (varsayılan: Teklif Gelenler varsa oraya açılır)
│
└─ Satınalma Dosyası  (/islem-merkezi/[talepId])
    ├─ Süreç göstergesi (9 aşama): Talep · Satınalma İncelemesi · Teklif Talebi ·
    │   Teklifler Bekleniyor · Teklif Değerlendirme · Sipariş · Teslimat · Fatura · Tamamlandı
    │   (aktif = mavi, tamamlanan = yeşil; adıma tıklayınca ilgili sekme)
    ├─ "Sıradaki işlem" önerisi
    ├─ Sekmeler: Genel Bakış · Kalemler · Teklif Süreci · Karşılaştırma ·
    │   Siparişler · Teslimat/Kalite · Faturalar · İletişim ve Geçmiş
    └─ Sabit "Dosya Özeti" paneli (talep/RFQ/durum/sorumlu/sayımlar/sıradaki işlem)
```

## Aşama hesabı (`src/domain/procurement-case.ts`)

`loadProcurementCase(talepId)` talebi merkez alarak ilişkili tüm kayıtları toplar ve **aşamayı türetir**:
tüm siparişler kapalı → Tamamlandı; fatura var → Fatura; mal kabul var → Teslimat; sipariş/karar var →
Sipariş; teklif geldi → Değerlendirme; RFQ gönderildi → Teklifler Bekleniyor; taslak RFQ → Teklif Talebi;
onaylı/atanmış → Satınalma İncelemesi; aksi → Talep.

## Türkçe durumlar (ham enum yok)

Tedarikçi yanıtları `supplierResponseLabel()` ile Türkçe gösterilir:
`Gönderilmedi · Gönderildi · Görüntülendi · Teklif Hazırlıyor · Teklif Geldi · Revizyon İstendi ·
Teklif Revize Edildi · Teklif Vermedi · Süresi Geçti`. `RESPONDED/SENT/OPEN` gibi ham değerler UI'da geçmez.

## RFQ ekranı (sadeleştirildi)

- Üst özet: "X davet · Y teklif geldi · Z bekleniyor · Son tarih: N gün kaldı".
- **Tek** "Tedarikçi Yanıtları" tablosu (önceki iki tekrarlı tedarikçi kutusu kaldırıldı): Tedarikçi ·
  Durum (Türkçe) · Teklif Tutarı · Son İşlem · [Gör · Teklif Gir/Düzenle].
- "Teklif Gir/Düzenle" = satınalma tarafından **manuel** girilen teklif (portaldan geleni ile karışmaz).
- "← Satınalma Dosyası" ile dosyaya döner.
- Tek teklif geldiyse karşılaştırmada uyarı: gerekçe gerekir.

## Keşfedilebilirlik

Yeni teklif geldiğinde: dashboard "Değerlendirilecek Teklif" + İşlem Merkezi "Teklif Gelenler" kuyruğu
(yeşil, sayılı) + RFQ listesi "Teklif Geldi" filtresi + "yanıtladı" rozeti. Kullanıcı RFQ listesinde veya
e-posta merkezinde numara aramak zorunda kalmaz.

## Test

`tests/e2e/islem-merkezi.spec.ts` — gerçek tıklamalarla: talep oluştur → İşlem Merkezi → dosya →
"Teklif Süreci" sekmesinden kalem seçip RFQ oluştur → dosyaya dönüp RFQ'yu gör. Kullanıcı ayrı listede
numara aramaz.

## Kalan iyileştirmeler (sonraki fazlar)

- Karşılaştırma ekranının tam yeniden tasarımı (sütun bazlı tedarikçi + rozetler + 2 aşamalı karar özeti).
- Sol menünün role göre daha da sadeleşmesi (RFQ'yu ileri-seviye alt menüye alma) ve mobil drawer.
- Bildirim dropdown'ının doğrudan dosya sekmesine derin bağlanması.
