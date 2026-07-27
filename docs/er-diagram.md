# ER Diyagramı (özet)

Tam şema: [`prisma/schema.prisma`](../prisma/schema.prisma) (70+ model). Aşağıda çekirdek akış varlıkları gösterilmiştir.

```mermaid
erDiagram
  Tenant ||--o{ Company : has
  Tenant ||--o{ User : has
  Tenant ||--o{ Supplier : has
  Company ||--o{ Department : has
  Company ||--o{ PurchaseRequisition : has
  User ||--o{ PurchaseRequisition : requests
  User ||--o{ UserRole : has
  Role ||--o{ UserRole : maps

  PurchaseRequisition ||--o{ RequisitionLine : contains
  PurchaseRequisition ||--o{ RFQLine : sources
  RFQ ||--o{ RFQLine : contains
  RFQ ||--o{ RFQSupplier : invites
  RFQ ||--o{ Bid : receives
  Supplier ||--o{ RFQSupplier : invited
  RFQSupplier ||--o{ Bid : submits
  Bid ||--o{ BidLine : contains
  RFQ ||--o| AwardDecision : decided

  AwardDecision ||--o{ PurchaseOrder : creates
  Supplier ||--o{ PurchaseOrder : fulfills
  PurchaseOrder ||--o{ PurchaseOrderLine : contains
  PurchaseOrder ||--o{ LandedCostItem : has
  PurchaseOrder ||--o{ GoodsReceipt : receives
  GoodsReceipt ||--o{ GoodsReceiptLine : contains
  GoodsReceipt ||--o{ QualityInspection : triggers
  PurchaseOrder ||--o{ Invoice : billed
  Invoice ||--o{ InvoiceLine : contains
  Invoice ||--o{ InvoiceMatch : matched

  ApprovalWorkflow ||--o{ ApprovalRule : has
  ApprovalRule ||--o{ ApprovalStep : has
  ApprovalWorkflow ||--o{ ApprovalInstance : runs
  ApprovalInstance ||--o{ ApprovalAction : records
```

## Tasarım notları

- **Para/miktar** alanları `String` (decimal-as-string) — floating-point yok, `decimal.js` ile hesaplanır.
- **Enum** alanları `String` + `src/lib/enums.ts` / `src/domain/operations.ts` sabitleri (SQLite uyumu; PostgreSQL native enum'a taşınabilir).
- **Esnek/uzun kuyruk** veriler (ör. `PurchaseOrder.importInfo`, `ApprovalRule.conditions`) JSON metni.
- **Soft delete:** `Supplier.deletedAt`. Finansal/denetim kayıtları (Invoice, AuditLog) fiziksel silinmez.
- **Tenant izolasyonu:** ana varlıklarda `tenantId` + indeksler; benzersizlik kısıtları tenant kapsamında (`@@unique([tenantId, ...])`).
- **Mükerrer engeli:** `Invoice @@unique([tenantId, supplierId, number])`, tedarikçi `taxNumber`/`iban` indeksleri.
