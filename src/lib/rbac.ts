/**
 * RBAC: Roller, yetkiler ve yetki matrisi.
 * Yetki kontrolü HER ZAMAN backend'de yapılır (frontend'e güvenilmez).
 */

// --- Yetki anahtarları (permission keys) ---
export const PERMISSIONS = {
  // Talep
  REQUISITION_VIEW: "requisition.view",
  REQUISITION_CREATE: "requisition.create",
  REQUISITION_EDIT: "requisition.edit",
  REQUISITION_APPROVE: "requisition.approve",
  REQUISITION_ASSIGN: "requisition.assign",
  // RFQ
  RFQ_VIEW: "rfq.view",
  RFQ_CREATE: "rfq.create",
  RFQ_EDIT: "rfq.edit",
  RFQ_SEND: "rfq.send",
  RFQ_EVALUATE: "rfq.evaluate",
  RFQ_AWARD: "rfq.award",
  // Sipariş
  ORDER_VIEW: "order.view",
  ORDER_CREATE: "order.create",
  ORDER_EDIT: "order.edit",
  ORDER_APPROVE: "order.approve",
  ORDER_SEND: "order.send",
  // Mal kabul & kalite
  RECEIPT_VIEW: "receipt.view",
  RECEIPT_CREATE: "receipt.create",
  QUALITY_VIEW: "quality.view",
  QUALITY_INSPECT: "quality.inspect",
  // Fatura
  INVOICE_VIEW: "invoice.view",
  INVOICE_CREATE: "invoice.create",
  INVOICE_MATCH: "invoice.match",
  INVOICE_APPROVE: "invoice.approve",
  // Tedarikçi
  SUPPLIER_VIEW: "supplier.view",
  SUPPLIER_CREATE: "supplier.create",
  SUPPLIER_EDIT: "supplier.edit",
  SUPPLIER_APPROVE: "supplier.approve",
  SUPPLIER_BANK_APPROVE: "supplier.bank.approve",
  // Katalog
  CATALOG_VIEW: "catalog.view",
  CATALOG_MANAGE: "catalog.manage",
  // LME Bakır fiyatlandırma
  LME_VIEW: "lme.view",
  LME_MANAGE: "lme.manage",
  // Satış CRM & CPQ
  SALES_VIEW: "sales.view",
  SALES_MANAGE: "sales.manage",
  // Sözleşme
  CONTRACT_VIEW: "contract.view",
  CONTRACT_MANAGE: "contract.manage",
  // Bütçe
  BUDGET_VIEW: "budget.view",
  BUDGET_MANAGE: "budget.manage",
  // Rapor
  REPORT_VIEW: "report.view",
  // Yönetim
  ADMIN_SETTINGS: "admin.settings",
  ADMIN_USERS: "admin.users",
  ADMIN_WORKFLOWS: "admin.workflows",
  ADMIN_INTEGRATIONS: "admin.integrations",
  AUDIT_VIEW: "audit.view",
  // PO Workspace & Tedarikçi İşbirliği Portalı
  PO_WORKSPACE_VIEW: "po.workspace.view",
  PO_WORKSPACE_COMMENT: "po.workspace.comment",       // tedarikçiye açık (isInternal=false) yorum
  PO_INTERNAL_COMMENT: "po.workspace.internalComment", // yalnız iç (isInternal=true) tartışma
  PO_PRODUCTION_UPDATE: "po.production.update",
  PO_PARTICIPANT_MANAGE: "po.participant.manage",
  TECH_REVIEW_VIEW: "techreview.view",
  TECH_REVIEW_CREATE: "techreview.create",             // tedarikçi oluşturur
  TECH_REVIEW_DECIDE: "techreview.decide",             // Coil karar verir (approve/reject/...)
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL = Object.values(PERMISSIONS);

// --- Rol tanımları (16 rol) ---
export const ROLE_KEYS = {
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  COMPANY_ADMIN: "COMPANY_ADMIN",
  REQUESTER: "REQUESTER",
  DEPT_MANAGER: "DEPT_MANAGER",
  TECHNICAL_APPROVER: "TECHNICAL_APPROVER",
  BUDGET_APPROVER: "BUDGET_APPROVER",
  FINANCE_APPROVER: "FINANCE_APPROVER",
  PURCHASING_SPECIALIST: "PURCHASING_SPECIALIST",
  PURCHASING_MANAGER: "PURCHASING_MANAGER",
  QUALITY_USER: "QUALITY_USER",
  WAREHOUSE_USER: "WAREHOUSE_USER",
  ACCOUNTING_USER: "ACCOUNTING_USER",
  AUDITOR: "AUDITOR",
  VIEWER: "VIEWER",
  SUPPLIER_MANAGER: "SUPPLIER_MANAGER",
  SUPPLIER_USER: "SUPPLIER_USER",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export const ROLE_LABELS_TR: Record<RoleKey, string> = {
  SYSTEM_ADMIN: "Sistem Yöneticisi",
  COMPANY_ADMIN: "Şirket Yöneticisi",
  REQUESTER: "Talep Sahibi",
  DEPT_MANAGER: "Departman Amiri",
  TECHNICAL_APPROVER: "Teknik Onaycı",
  BUDGET_APPROVER: "Bütçe Onaycısı",
  FINANCE_APPROVER: "Finans Onaycısı",
  PURCHASING_SPECIALIST: "Satınalma Uzmanı",
  PURCHASING_MANAGER: "Satınalma Yöneticisi",
  QUALITY_USER: "Kalite Kullanıcısı",
  WAREHOUSE_USER: "Depo Kullanıcısı",
  ACCOUNTING_USER: "Muhasebe Kullanıcısı",
  AUDITOR: "Denetçi",
  VIEWER: "Görüntüleyici",
  SUPPLIER_MANAGER: "Tedarikçi Yöneticisi",
  SUPPLIER_USER: "Tedarikçi Kullanıcısı",
};

const P = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  SYSTEM_ADMIN: ALL,
  COMPANY_ADMIN: ALL.filter((p) => p !== P.ADMIN_INTEGRATIONS),
  REQUESTER: [P.REQUISITION_VIEW, P.REQUISITION_CREATE, P.REQUISITION_EDIT, P.CATALOG_VIEW],
  DEPT_MANAGER: [
    P.REQUISITION_VIEW,
    P.REQUISITION_CREATE,
    P.REQUISITION_EDIT,
    P.REQUISITION_APPROVE,
    P.CATALOG_VIEW,
    P.REPORT_VIEW,
    // PO Workspace (planlama/yönetim tarafı: görüntüle + yorum + iç tartışma)
    P.PO_WORKSPACE_VIEW,
    P.PO_WORKSPACE_COMMENT,
    P.PO_INTERNAL_COMMENT,
    P.TECH_REVIEW_VIEW,
  ],
  TECHNICAL_APPROVER: [
    P.REQUISITION_VIEW,
    P.REQUISITION_APPROVE,
    P.RFQ_VIEW,
    P.CATALOG_VIEW,
    // PO Workspace (teknik: yorum/iç tartışma + teknik inceleme kararı)
    P.PO_WORKSPACE_VIEW,
    P.PO_WORKSPACE_COMMENT,
    P.PO_INTERNAL_COMMENT,
    P.TECH_REVIEW_VIEW,
    P.TECH_REVIEW_CREATE,
    P.TECH_REVIEW_DECIDE,
  ],
  BUDGET_APPROVER: [
    P.REQUISITION_VIEW,
    P.REQUISITION_APPROVE,
    P.ORDER_VIEW,
    P.ORDER_APPROVE,
    P.BUDGET_VIEW,
    P.REPORT_VIEW,
  ],
  FINANCE_APPROVER: [
    P.REQUISITION_VIEW,
    P.ORDER_VIEW,
    P.ORDER_APPROVE,
    P.INVOICE_VIEW,
    P.INVOICE_APPROVE,
    P.BUDGET_VIEW,
    P.REPORT_VIEW,
  ],
  PURCHASING_SPECIALIST: [
    P.REQUISITION_VIEW,
    P.REQUISITION_ASSIGN,
    P.RFQ_VIEW,
    P.RFQ_CREATE,
    P.RFQ_EDIT,
    P.RFQ_SEND,
    P.RFQ_EVALUATE,
    P.ORDER_VIEW,
    P.ORDER_CREATE,
    P.ORDER_EDIT,
    P.ORDER_SEND,
    P.SUPPLIER_VIEW,
    P.SUPPLIER_CREATE,
    P.SUPPLIER_EDIT,
    P.CATALOG_VIEW,
    P.LME_VIEW,
    P.LME_MANAGE,
    P.SALES_VIEW,
    P.SALES_MANAGE,
    P.CONTRACT_VIEW,
    P.REPORT_VIEW,
    // PO Workspace (tam)
    P.PO_WORKSPACE_VIEW,
    P.PO_WORKSPACE_COMMENT,
    P.PO_INTERNAL_COMMENT,
    P.PO_PRODUCTION_UPDATE,
    P.PO_PARTICIPANT_MANAGE,
    P.TECH_REVIEW_VIEW,
    P.TECH_REVIEW_CREATE,
    P.TECH_REVIEW_DECIDE,
  ],
  PURCHASING_MANAGER: [
    P.LME_VIEW,
    P.LME_MANAGE,
    P.SALES_VIEW,
    P.SALES_MANAGE,
    P.REQUISITION_VIEW,
    P.REQUISITION_ASSIGN,
    P.REQUISITION_APPROVE,
    P.RFQ_VIEW,
    P.RFQ_CREATE,
    P.RFQ_EDIT,
    P.RFQ_SEND,
    P.RFQ_EVALUATE,
    P.RFQ_AWARD,
    P.ORDER_VIEW,
    P.ORDER_CREATE,
    P.ORDER_EDIT,
    P.ORDER_APPROVE,
    P.ORDER_SEND,
    P.SUPPLIER_VIEW,
    P.SUPPLIER_CREATE,
    P.SUPPLIER_EDIT,
    P.SUPPLIER_APPROVE,
    P.SUPPLIER_BANK_APPROVE,
    P.CATALOG_VIEW,
    P.CATALOG_MANAGE,
    P.CONTRACT_VIEW,
    P.CONTRACT_MANAGE,
    P.BUDGET_VIEW,
    P.REPORT_VIEW,
    // PO Workspace (tam)
    P.PO_WORKSPACE_VIEW,
    P.PO_WORKSPACE_COMMENT,
    P.PO_INTERNAL_COMMENT,
    P.PO_PRODUCTION_UPDATE,
    P.PO_PARTICIPANT_MANAGE,
    P.TECH_REVIEW_VIEW,
    P.TECH_REVIEW_CREATE,
    P.TECH_REVIEW_DECIDE,
  ],
  QUALITY_USER: [
    P.RECEIPT_VIEW,
    P.QUALITY_VIEW,
    P.QUALITY_INSPECT,
    P.SUPPLIER_VIEW,
    P.REPORT_VIEW,
    // PO Workspace (kalite: görüntüle/yorum + üretim-kalite aşaması + teknik inceleme görüntüle)
    P.PO_WORKSPACE_VIEW,
    P.PO_WORKSPACE_COMMENT,
    P.PO_PRODUCTION_UPDATE,
    P.TECH_REVIEW_VIEW,
  ],
  WAREHOUSE_USER: [P.ORDER_VIEW, P.RECEIPT_VIEW, P.RECEIPT_CREATE, P.PO_WORKSPACE_VIEW, P.PO_PRODUCTION_UPDATE],
  ACCOUNTING_USER: [
    P.ORDER_VIEW,
    P.INVOICE_VIEW,
    P.INVOICE_CREATE,
    P.INVOICE_MATCH,
    P.SUPPLIER_VIEW,
    P.REPORT_VIEW,
  ],
  AUDITOR: [
    P.REQUISITION_VIEW,
    P.RFQ_VIEW,
    P.ORDER_VIEW,
    P.INVOICE_VIEW,
    P.SUPPLIER_VIEW,
    P.CONTRACT_VIEW,
    P.BUDGET_VIEW,
    P.REPORT_VIEW,
    P.AUDIT_VIEW,
    P.PO_WORKSPACE_VIEW,
    P.TECH_REVIEW_VIEW,
  ],
  VIEWER: [
    P.REQUISITION_VIEW,
    P.RFQ_VIEW,
    P.ORDER_VIEW,
    P.SUPPLIER_VIEW,
    P.CATALOG_VIEW,
    P.REPORT_VIEW,
    P.PO_WORKSPACE_VIEW,
    P.TECH_REVIEW_VIEW,
  ],
  // Tedarikçi portalı (ayrı yüzey) — izinler TEDARİKÇİ-SCOPED'tur:
  // taşıyıcı guard (assertPoAccess) yalnızca kendi supplierId'sine ait PO'lara izin verir.
  SUPPLIER_USER: [
    P.PO_WORKSPACE_VIEW,
    P.PO_WORKSPACE_COMMENT,   // yalnız isInternal=false yorum
    P.PO_PRODUCTION_UPDATE,   // kendi üretim aşaması güncellemesi
    P.TECH_REVIEW_CREATE,
    P.TECH_REVIEW_VIEW,
  ],
  SUPPLIER_MANAGER: [
    P.PO_WORKSPACE_VIEW,
    P.PO_WORKSPACE_COMMENT,
    P.PO_PRODUCTION_UPDATE,
    P.TECH_REVIEW_CREATE,
    P.TECH_REVIEW_VIEW,
    P.PO_PARTICIPANT_MANAGE,  // kendi ekibini (tedarikçi kullanıcıları) yönetir
  ],
};

export function permissionsForRoles(roleKeys: string[]): Set<string> {
  const set = new Set<string>();
  for (const key of roleKeys) {
    const perms = ROLE_PERMISSIONS[key as RoleKey];
    if (perms) perms.forEach((p) => set.add(p));
  }
  return set;
}

export function hasPermission(userPermissions: Set<string>, required: Permission): boolean {
  return userPermissions.has(required);
}
