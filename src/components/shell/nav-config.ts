import { PERMISSIONS, type Permission } from "@/lib/rbac";

export interface NavItem {
  href: string;
  labelKey: string;
  label: string;
  icon: string; // lucide icon adı
  permission?: Permission;
  group: "main" | "sales" | "procurement" | "supply" | "finance" | "master" | "admin";
  /** İleri-seviye: günlük kullanıcının ana menüsünü yormaz; grup altında "İleri" bölümünde toplanır. */
  secondary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", label: "Kontrol Paneli", icon: "LayoutDashboard", group: "main" },
  { href: "/tasks", labelKey: "nav.tasks", label: "Görevlerim", icon: "CheckSquare", group: "main" },
  { href: "/approvals", labelKey: "nav.approvals", label: "Onaylarım", icon: "Stamp", group: "main" },

  // Satınalma grubu düz listelenir (tek öğe için "İleri" katlanır bölümü gereksizdi).
  { href: "/sales", labelKey: "nav.salesDashboard", label: "Satış Paneli", icon: "TrendingUp", permission: PERMISSIONS.SALES_VIEW, group: "sales" },
  { href: "/sales/rfqs", labelKey: "nav.salesRfqs", label: "Müşteri Talepleri", icon: "Inbox", permission: PERMISSIONS.SALES_VIEW, group: "sales" },
  { href: "/sales/offers", labelKey: "nav.salesOffers", label: "Müşteri Teklifleri", icon: "FileText", permission: PERMISSIONS.SALES_VIEW, group: "sales" },
  { href: "/sales/customers", labelKey: "nav.salesCustomers", label: "Müşteriler", icon: "Users", permission: PERMISSIONS.SALES_VIEW, group: "sales" },
  { href: "/islem-merkezi", labelKey: "nav.islemMerkezi", label: "Satınalma İşlem Merkezi", icon: "LayoutList", permission: PERMISSIONS.REQUISITION_VIEW, group: "procurement" },
  { href: "/requisitions", labelKey: "nav.requisitions", label: "Talepler", icon: "FileText", permission: PERMISSIONS.REQUISITION_VIEW, group: "procurement" },
  { href: "/rfqs", labelKey: "nav.rfqs", label: "Teklif Talepleri", icon: "Send", permission: PERMISSIONS.RFQ_VIEW, group: "procurement" },
  { href: "/orders", labelKey: "nav.orders", label: "Siparişler", icon: "ShoppingCart", permission: PERMISSIONS.ORDER_VIEW, group: "procurement" },

  { href: "/receipts", labelKey: "nav.receipts", label: "Mal Kabul", icon: "PackageCheck", permission: PERMISSIONS.RECEIPT_VIEW, group: "supply" },
  { href: "/quality", labelKey: "nav.quality", label: "Kalite", icon: "BadgeCheck", permission: PERMISSIONS.QUALITY_VIEW, group: "supply" },
  { href: "/invoices", labelKey: "nav.invoices", label: "Faturalar", icon: "Receipt", permission: PERMISSIONS.INVOICE_VIEW, group: "finance" },
  { href: "/budgets", labelKey: "nav.budgets", label: "Bütçeler", icon: "Wallet", permission: PERMISSIONS.BUDGET_VIEW, group: "finance" },

  { href: "/suppliers", labelKey: "nav.suppliers", label: "Tedarikçiler", icon: "Building2", permission: PERMISSIONS.SUPPLIER_VIEW, group: "master" },
  { href: "/catalog", labelKey: "nav.catalog", label: "Ürün Kataloğu", icon: "Boxes", permission: PERMISSIONS.CATALOG_VIEW, group: "master" },
  { href: "/lme", labelKey: "nav.lme", label: "LME Bakır", icon: "TrendingUp", permission: PERMISSIONS.LME_VIEW, group: "master" },
  { href: "/contracts", labelKey: "nav.contracts", label: "Sözleşmeler", icon: "FileSignature", permission: PERMISSIONS.CONTRACT_VIEW, group: "master" },
  { href: "/reports", labelKey: "nav.reports", label: "Raporlar", icon: "BarChart3", permission: PERMISSIONS.REPORT_VIEW, group: "master" },

  { href: "/emails", labelKey: "nav.emails", label: "E-posta Merkezi", icon: "Mail", permission: PERMISSIONS.RFQ_VIEW, group: "admin" },
  { href: "/integrations", labelKey: "nav.integrations", label: "Entegrasyonlar", icon: "Plug", permission: PERMISSIONS.ADMIN_INTEGRATIONS, group: "admin" },
  { href: "/audit", labelKey: "nav.audit", label: "Denetim Kayıtları", icon: "ScrollText", permission: PERMISSIONS.AUDIT_VIEW, group: "admin" },
  { href: "/admin/users", labelKey: "nav.users", label: "Kullanıcılar", icon: "Users", permission: PERMISSIONS.ADMIN_USERS, group: "admin" },
  { href: "/admin/settings", labelKey: "nav.settings", label: "Ayarlar", icon: "Settings", permission: PERMISSIONS.ADMIN_SETTINGS, group: "admin" },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  main: "",
  sales: "Satış & CRM",
  procurement: "Satınalma",
  supply: "Tedarik & Kalite",
  finance: "Finans",
  master: "Ana Veri & Analiz",
  admin: "Yönetim",
};
