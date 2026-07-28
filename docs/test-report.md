# Test Raporu

Son çalıştırma: yerel geliştirme ortamı (Node 24). Birim/entegrasyon SQLite üzerinde; E2E hem SQLite hem
PostgreSQL production build üzerinde çalıştırıldı.

## Özet

| Aşama | Sonuç |
|---|---|
| ESLint (`next lint`) | ✅ 0 hata / 0 uyarı |
| TypeScript tip kontrolü (`tsc --noEmit`) | ✅ Hatasız |
| Production build (`next build`) | ✅ 41 route + middleware derlendi |
| Birim/entegrasyon testleri (Vitest) | ✅ **80/80** geçti (13 dosya) |
| E2E testleri (Playwright, tarayıcı) | ✅ **8/8** geçti — SQLite ve PostgreSQL |
| Çalışma zamanı (`/api/health`) | ✅ `{"status":"ok","db":"up"}` |

## Birim testleri (70 / 11 dosya)

- **money.test.ts (9):** güvenli decimal aritmetiği — `0.1+0.2=0.30`, satır net/KDV/tevkifat, büyük tutar hassasiyeti (floating-point yok).
- **state-machines.test.ts (7):** geçerli/geçersiz durum geçişleri; terminal durumlar; `assertTransition` hata fırlatma.
- **rbac.test.ts (4):** rol/yetki matrisi — talep sahibi onaylayamaz, müdür karar verir, görüntüleyici salt-okunur, admin tam yetki.
- **landed-cost.test.ts (4):** değer/ağırlık/miktar bazlı dağıtım, çoklu masraf toplamı, dağıtımda kayıp olmaması.
- **i18n.test.ts (7):** TR/EN eksik çeviri anahtarı denetimi, boş çeviri kontrolü, Türkçe karakter sıralaması, aksan duyarsız arama, yerele göre para biçimi.
- **i18n-parity.test.ts (7):** `tr.ts` ⇄ `en.ts` tam aynı anahtar kümesi (runtime), boş değer yok, sözlükte mojibake yok, kapsam alt-sınırı; `STATUS_LABELS_TR` ⇄ `STATUS_LABELS_EN` paritesi; `statusLabel` doğru dilde etiket.
- **no-mojibake.test.ts (2):** kaynak ağacında CP1252 çift-kodlama regresyon guard'ı.
- **metrics.test.ts (7):** OTIF, req→sipariş çevrim süresi, onay bekleme, tasarruf saf fonksiyonları + "veri yetersiz" göstergesi.
- **import.test.ts (9):** Excel/CSV içe aktarma ayrıştırma — boş fiyat/KDV = null (0 değil), tarih/PB/miktar normalizasyonu.
- **invoice-matching.test.ts (6):** üçlü eşleştirme — miktar/fiyat/tutar toleransı içi MATCHED, dışı PRICE/QTY_VARIANCE.
- **security-primitives.test.ts (8):** token hash, TOTP (RFC 6238) doğrulama, parola bcrypt hash/karşılaştırma.

## Entegrasyon testleri (10 / 2 dosya) — gerçek DB, rollback transaction

- **business-rules.test.ts (6):** görevler ayrılığı (kendi talebini onaylayamama), **vekâlet**, yetkisiz reddi, **mükerrer fatura (unique kısıt)**, **tenant izolasyonu**.
- **full-chain.test.ts (4):** zincirin **arka yarısı** — award→PO hesabı (net 29.500 / KDV 5.900 / genel toplam 35.400), gerçek PO+mal kabul ile üçlü eşleştirme tolerans içi **MATCHED** ve tolerans dışı **BLOCKED (PRICE_VARIANCE)**, magic-link teklif gönderimi (`saveBid`, gerçek token akışı → SUBMITTED).

## E2E testleri (8) — gerçek tarayıcı (Chromium)

E2E, ana zincirin **tarayıcıda yürütülen ön yarısını** doğrular. Zincirin arka yarısı (award→PO→mal
kabul→fatura→tolerans) deterministik olarak yukarıdaki **entegrasyon** testinde doğrulanır.

**Tarayıcıda doğrulanan adımlar:**
1. `full-flow.spec.ts` — Talep oluştur → **amir onayı** → **satınalma müdürü onayı** → **RFQ oluşturma** zinciri; her adım gerçek server action, durum geçişleri DB'den doğrulanır (`PENDING_APPROVAL` → `APPROVED/IN_RFQ` → RFQ kaydı + `IN_RFQ`).
2. `crud.spec.ts` — **Tedarikçi oluşturma** (satınalma müdürü; `TED-` kodlu kayıt DB'de doğrulanır).
3. `crud.spec.ts` — **Kullanıcı oluşturma** (sistem yöneticisi; parola bcrypt hash + RBAC rol ataması DB'de doğrulanır).
4. `smoke.spec.ts` — Giriş yapılmadan `/dashboard` → `/login` yönlendirmesi.
5. `smoke.spec.ts` — Satınalma uzmanı giriş → dashboard (gerçek oturum + RBAC + veri).
6. `smoke.spec.ts` — Hatalı parola reddedilir.
7. `smoke.spec.ts` — Geçersiz magic-link token'ı reddedilir.
8. `smoke.spec.ts` — Tedarikçi portalı **EN dil değiştirme** çalışır.

**Backend/entegrasyon ile doğrulanan adımlar (tarayıcıda değil):** tedarikçi teklif karşılaştırma →
split award → otomatik PO → kısmi mal kabul → kalite → fatura → **üçlü eşleştirme (tolerans içi kabul /
dışı bloke)**. Bu adımlar `full-chain.test.ts` ve `invoice-matching.test.ts` içinde gerçek kayıt/hesapla
doğrulanır.

**İki veritabanında da:** aynı 8 E2E paketi **SQLite** ve **PostgreSQL** production build üzerinde 8/8 geçer.

## Çalıştırma

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

PostgreSQL üzerinde E2E için: `schema.prisma` provider `postgresql`, PG server ayakta, `DATABASE_URL`
PG'yi gösterir; `npx prisma db push` + `npx prisma generate` + `npm run build` sonrası `npx playwright test`.
