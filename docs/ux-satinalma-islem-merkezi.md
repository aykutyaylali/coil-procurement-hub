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

## Teklif karşılaştırma ve karar (Faz D)

- **Sütun bazlı karşılaştırma**: sol sabit "Kriter" kolonu (yatay kaydırmada sticky), her tedarikçi ayrı
  sütun. Sütun başlığında rozetler: **En Düşük Fiyat** (TL bazlı) · **En Kısa Termin** · **Tek Teklif** ·
  **Eksik Bilgi** + kaynak (portal/manuel/e-posta). Başlığa tıklayınca **teklif detay drawer** (tüm alanlar +
  kalem bazında marka/model/birim/isk/KDV/termin/not).
- **TL karşılığı**: farklı para birimlerindeki (USD/EUR/GBP) teklifler TCMB kuruyla TL'ye çevrilip
  karşılaştırılır. Kalem bazında en düşük işaretlenir.
- **Kalem bazlı seçim** (split award): farklı kalemler farklı tedarikçilere verilebilir.
- **İki aşamalı karar**: (1) seçim + gerekçe + en-düşük-değil/tek-teklif açıklaması (zorunlu) →
  (2) **Karar Özeti** (kalem/tedarikçi/miktar/birim/tutar/TL/termin + toplam + oluşacak sipariş sayısı +
  gerekçeler + uyarılar) → **"Kararı Onayla ve X Sipariş Oluştur"** → onay modalı → spinner/disabled
  (çift-tıklama koruması) → başarı + oluşan siparişlere linkler.

## Rol bazlı menü + bildirim (Faz E)

- **Sade menü**: satınalma ana menüsü Kontrol Paneli · İşlem Merkezi · Talepler · Siparişler · Tedarikçiler ·
  Raporlar. RFQ (Teklif Talepleri) grup altında katlanabilir **"İleri"** bölümünde; asıl erişim dosya içinden.
  Görünürlük izne bağlı (RBAC): yetkisiz modüller görünmez; backend `requirePermission` her sayfada korunur.
- **Mobil drawer**: `lg` altında topbar'da hamburger → erişilebilir drawer (role=dialog, aria-modal,
  overlay/X ile kapanır, gezinince kapanır).
- **Bildirim derin-linkleri**: yeni teklif bildirimi doğrudan dosyanın **Karşılaştırma** sekmesine gider
  (`/islem-merkezi/[talep]?tab=karsilastirma`), genel listeye değil. Okundu/okunmadı + rozet + tarih.

## Test

- `tests/e2e/islem-merkezi.spec.ts` — birleşik akış (talep→dosya→Teklif Süreci→RFQ).
- `tests/e2e/comparison-award.spec.ts` — karşılaştırma + split seçim + Karar Özeti + onay → 2 sipariş
  (gerçek tıklamalar, farklı para birimleri).
