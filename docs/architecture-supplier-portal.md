# Mimari Tasarım — Tedarikçi İşbirliği Portalı & PO Workspace

> Master Prompt (`COIL_MASTER_PROMPT_CLAUDE_CODE.md`) §5–§9, §11, §18 vizyonunun
> **additive, sıfır-kırıcı** uygulama tasarımı. Onaylanan kararlar (2026-07) bu
> dokümanda kayıtlıdır; artımlı fazlar sırayla uygulanır.

## 0. Yol gösterici ilkeler
- **Additive & sıfır-kırıcı**: Mevcut `ORDER_TRANSITIONS`, mal kabul→fatura zinciri ve
  RFQ magic-link portalı **değişmez**.
- **Mevcut polimorfik primitifleri yeniden kullan**: `Comment`, `Attachment` (ikisi de
  `entityType`/`entityId` + `isInternal`), `AuditLog`, `Notification`, `Task` → PO'ya
  `entityType:"PurchaseOrder"` ile bağlanır.
- **Enum sakla, UI'da çevir** (Master §6/§15). **Tenant + tedarikçi izolasyonu** her katmanda.
- **Her PO = paylaşımlı çalışma alanı**; ayrı Workspace tablosu yoktur (PO'nun kendisi çıpa).

## 1. Onaylanan kararlar
- **#1 Oturumlu tedarikçi kullanıcısı** — `SupplierContact.userId → User` + `SUPPLIER_USER`
  rolü hayata geçirilir; davet, onboarding magic-link'i ile parola-belirlemeye dönüşür.
  Mevcut RFQ magic-link teklif akışı korunur.
- **#2 Üretim aşaması, finansal PO durumundan AYRIŞTIRILIR** — `PurchaseOrder.productionStage`
  (+ `POProductionUpdate` log) ayrı bir boyuttur; `ORDER_TRANSITIONS` hiç değişmez.
- **#3 Görünürlük `isInternal` ile** — tedarikçi yalnızca `isInternal=false` içerik görür;
  "Internal Discussion" = `isInternal=true`.
- **#4 Gerçek-zaman** ilk fazda poll/`revalidate`+`router.refresh`; WebSocket/SSE ayrı alt-faz.

## 2. Yeniden kullanılan mevcut yapı
| İhtiyaç | Mevcut model | Karar |
|---|---|---|
| Dosya/görsel/PDF/çizim | `Attachment` (polimorfik, `isInternal`, `scanStatus`) | aynen kullan |
| Yorum tabanı | `Comment` (polimorfik, `isInternal`, UI'da kullanılmıyor) | thread/mention/read ile genişlet |
| Değişmez zaman çizelgesi | `AuditLog` (append-only) | Timeline = okuma-tarafı agregasyon |
| Bildirim | `Notification` (serbest `type`) | yeni type'lar + `notify()` helper |
| Tedarikçi kimliği | `SupplierContact.userId → User`, `SUPPLIER_USER/MANAGER` rolleri | auth'a bağla |

## 3. Veri modeli (additive)
Yeni modeller: `POParticipant`, `POProductionUpdate`, `TechnicalReview`,
`TechnicalReviewAction`, `CommentMention`, `ThreadRead`.
Additive alanlar: `PurchaseOrder.productionStage String?`, `Comment.parentId String?`
(self-relation, thread), `Comment.tenantId String?`.
Hiçbir mevcut kolon/ilişki değişmez. Dev'de `db push`; prod için migration
(bkz. `docs/postgres-migration.md`). Ayrıntılı alan listeleri `prisma/schema.prisma`
içindeki `// --- PO WORKSPACE ---` bölümündedir.

Ayrı `PO_PRODUCTION_TRANSITIONS` state-machine'i üretim aşama geçişlerini yönetir
(mevcut `src/domain/state-machines.ts` desenine uyumlu).

## 4. RBAC & izolasyon
Yeni izinler: `PO_WORKSPACE_VIEW`, `PO_WORKSPACE_COMMENT`, `PO_INTERNAL_COMMENT`,
`PO_PRODUCTION_UPDATE`, `PO_PARTICIPANT_MANAGE`, `TECH_REVIEW_VIEW`, `TECH_REVIEW_CREATE`,
`TECH_REVIEW_DECIDE`.

- **İç roller** (PURCHASING_*, TECHNICAL_APPROVER, QUALITY_USER, DEPT_MANAGER, MANAGEMENT):
  rollerine göre alt-kümeler (bkz. `src/lib/rbac.ts` ROLE_PERMISSIONS).
- **Tedarikçi roller** (bugüne dek `[]`): tedarikçi-scoped set.
  `SUPPLIER_USER = [PO_WORKSPACE_VIEW, PO_WORKSPACE_COMMENT, PO_PRODUCTION_UPDATE,
  TECH_REVIEW_CREATE, TECH_REVIEW_VIEW]`, `SUPPLIER_MANAGER = SUPPLIER_USER + PO_PARTICIPANT_MANAGE`.
- **İzolasyon kuralı**: Tedarikçi kullanıcısı yalnızca `po.supplierId === user.supplierId`
  olan PO'lara erişir. `AuthUser.supplierId` (`user.supplierUser.supplierId` üzerinden çözülür)
  + `assertPoAccess(po, user)` guard'ı: iç kullanıcı → tenant eşleşmesi; tedarikçi →
  supplierId eşleşmesi. `isInternal=true` içerik tedarikçiye asla dönmez.
- **Tedarikçi auth**: `getCurrentUser` zaten rolleri çözüyor; `SupplierContact.userId` bağlı
  + `SUPPLIER_USER` rollü kullanıcı login olabilir (mevcut cookie oturumu). Onboarding,
  birincil kişiye parola-belirleme daveti üretecek şekilde genişletilir (Faz 6).

## 5. UI & i18n
- İç yüzey: `/orders/[id]` sekmeli workspace ile genişletilir (`?tab=`):
  Genel · Üretim · Teknik İncelemeler · Tartışma · Belgeler · Zaman Çizelgesi.
- Tedarikçi yüzeyi: yeni auth'lu route group `(supplier)` → `/portal/orders`,
  `/portal/orders/[id]` (aynı workspace, `isInternal=false` filtreli).
- i18n ad-alanları: `po.workspace.*`, `po.production.*`, `techreview.*`, `discussion.*`,
  `po.timeline.*`, `portal.*`, yeni `notif.*`. Tüm enum'lar UI'da çevrilir, DB'de kod saklanır.

## 6. Artımlı fazlar (her biri ayrı commit + test)
1. **Şema + RBAC + izolasyon** (bu adım): 6 model + 3 kolon; yeni izinler; `AuthUser.supplierId`;
   `assertPoAccess`. `db push` + tsc/lint/RBAC-parite testleri.
2. Belgeler + Timeline sekmeleri (en düşük risk).
3. Discussion (Comment genişletme + mention + read).
4. Üretim ilerlemesi (stepper + updates + state-machine).
5. Teknik İnceleme (form + karar akışı + geçmiş).
6. Tedarikçi auth + `(supplier)` portalı.
7. `notify()` + yeni bildirim tipleri + i18n tamamlama.
