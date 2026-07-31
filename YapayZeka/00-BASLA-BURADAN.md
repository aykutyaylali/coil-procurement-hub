# Başla Buradan — Diğer Yapay Zekâlara Projeyi Sormak İçin

Bu klasör, **Coil Procurement Hub** projesini başka bir yapay zekâya (ChatGPT, Gemini,
Grok, başka bir Claude oturumu vb.) anlatıp **fikir/görüş almak** için hazırlandı.

## Klasördeki dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `00-BASLA-BURADAN.md` | Bu dosya — nasıl kullanılır + hazır soru şablonu |
| `01-PROJE-RAPORU.md` | **Ana rapor** — projeyi sıfırdan anlatır (mimari, özellikler, durum, açık sorular) |
| `schema.prisma` | Tüm veri modeli (74 model) — mimari sorularında en değerli bağlam |
| `package.json` | Bağımlılıklar ve komutlar (teknoloji yığını) |
| `README.md` | Kullanıcıya dönük genel tanıtım |
| `RAPOR.md` | Oturum oturum yapılan işlerin günlüğü |
| `dizin-yapisi.txt` | src/prisma/docs/tests dosya ağacı |
| `env.example.txt` | Ortam değişkeni şablonu (gerçek sır İÇERMEZ) |

> ⚠️ **Gizlilik:** Bu klasörde gerçek parola, API anahtarı veya veritabanı **yoktur**.
> `.env`, `*.db` ve `storage/` bilinçli olarak kopyalanmadı. Paylaşırken de eklemeyin.

## Nasıl kullanılır

1. Sormak istediğin yapay zekâya önce `01-PROJE-RAPORU.md` içeriğini yapıştır.
2. Daha teknik/mimari bir soru soracaksan `schema.prisma` ve `package.json`'ı da ekle.
3. Aşağıdaki şablonla sorunu sor.

## Hazır soru şablonu (kopyala-yapıştır)

```
Aşağıda "Coil Procurement Hub" adlı bir kurumsal satınalma (procurement) yazılımının
proje raporu var. Bu bir SAP Ariba / Coupa benzeri platform. Next.js 15 + Prisma ile
yazıldı. Raporu oku ve şu konuda görüşünü ver:

[SORUNU BURAYA YAZ — örnekler:]
- Bu mimaride en büyük risk/eksik nedir?
- Teklif karşılaştırma ve karar (award) akışını nasıl daha iyi tasarlarsın?
- Çok para birimli teklifleri karşılaştırırken hangi tuzaklara dikkat etmeliyim?
- Kalite (bobin testleri) modülünü bir sonraki adımda nasıl geliştirirsin?
- Bu ürünü gerçek bir müşteriye satmadan önce kapatılması gereken 5 boşluk nedir?

Somut, uygulanabilir öneriler ver. Gerekiyorsa dosya/tablo bazında yaz.

--- PROJE RAPORU ---
[01-PROJE-RAPORU.md içeriğini buraya yapıştır]
```

## Güncel tutma

Projede önemli bir değişiklik olduğunda bu klasörü tazelemek için (kök dizinde):

```bash
cp prisma/schema.prisma package.json README.md RAPOR.md YapayZeka/
```

`01-PROJE-RAPORU.md` elle güncellenir (aşağıdaki "Güncel durum" bölümü).
