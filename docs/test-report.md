# Test Raporu

Son çalıştırma: yerel geliştirme ortamı (Node 24, SQLite).

## Özet

| Aşama | Sonuç |
|---|---|
| TypeScript tip kontrolü (`tsc --noEmit`) | ✅ Hatasız |
| Production build (`next build`) | ✅ 31 route + middleware derlendi |
| Birim/entegrasyon testleri (Vitest) | ✅ 31/31 geçti |
| E2E testleri (Playwright) | ✅ 5/5 geçti |
| Çalışma zamanı (`/api/health`) | ✅ `{"status":"ok","db":"up"}` |

## Birim/entegrasyon testleri (31)

- **money.test.ts (9):** güvenli decimal aritmetiği — `0.1+0.2=0.30`, satır net/KDV/tevkifat, büyük tutar hassasiyeti (floating-point yok).
- **state-machines.test.ts (7):** geçerli/geçersiz durum geçişleri; terminal durumlar; `assertTransition` hata fırlatma.
- **rbac.test.ts (4):** rol/yetki matrisi — talep sahibi onaylayamaz, müdür karar verir, görüntüleyici salt-okunur, admin tam yetki.
- **landed-cost.test.ts (4):** değer/ağırlık/miktar bazlı dağıtım, çoklu masraf toplamı, dağıtımda kayıp olmaması.
- **i18n.test.ts (7):** **TR/EN eksik çeviri anahtarı denetimi**, boş çeviri kontrolü, Türkçe karakter sıralaması ve aksan duyarsız arama, yerele göre para biçimi.

## E2E testleri (5) — gerçek tarayıcı (Chromium)

1. Giriş yapılmadan `/dashboard` → `/login` yönlendirmesi. ✅
2. Satınalma uzmanı giriş → dashboard görünür (gerçek oturum + RBAC + veri). ✅
3. Hatalı parola reddedilir. ✅
4. Geçersiz magic-link token'ı reddedilir. ✅
5. Tedarikçi portalı **EN dil değiştirme** çalışır. ✅

## Şartname senaryolarının karşılığı

Şartnamedeki 25 test senaryosunun otomatik/çalışan karşılıkları: para birimi decimal hesabı (11), durum geçiş engelleme (14 kısmı), RBAC yetkisiz onay engeli (3), magic-link token reddi (7), i18n/iç not ayrımı altyapısı (19), audit (20). Kalan senaryolar (kısmi teslim eşleştirme, üçlü fatura eşleştirme, bütçe rezervasyonu) için domain fonksiyonları ve veri modeli hazırdır; entegrasyon testleriyle genişletilebilir.

## Çalıştırma

```bash
npm run typecheck && npm test && npm run build && npm run test:e2e
```
