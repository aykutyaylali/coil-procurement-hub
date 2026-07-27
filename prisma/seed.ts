/**
 * Seed / demo verisi. Gerçekçi fakat sahte veri üretir.
 * Üretimde (NODE_ENV=production) seed kullanıcılarının oluşmasını engeller.
 * Demo giriş bilgileri README'de belirtilmiştir.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ROLE_KEYS, ROLE_LABELS_TR, ROLE_PERMISSIONS, type RoleKey } from "../src/lib/rbac";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Coil2026!";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    console.log("Üretim ortamında seed atlanıyor (ALLOW_PROD_SEED=true ile zorlayabilirsiniz).");
    return;
  }

  console.log("Seed başlıyor...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // --- Tenant ---
  const tenant = await prisma.tenant.upsert({
    where: { slug: "coil-partners" },
    update: {},
    create: {
      slug: "coil-partners",
      name: "Coil Partners Bobinaj San. ve Tic. A.Ş.",
      settings: JSON.stringify({ brandColor: "#2563eb", defaultCurrency: "TRY" }),
    },
  });
  const tenantId = tenant.id;

  // --- Roller ---
  const roleIdByKey: Record<string, string> = {};
  for (const key of Object.values(ROLE_KEYS)) {
    const role = await prisma.role.upsert({
      where: { tenantId_key: { tenantId, key } },
      update: {},
      create: {
        tenantId,
        key,
        name: ROLE_LABELS_TR[key as RoleKey],
        isSystem: true,
        permissions: JSON.stringify(ROLE_PERMISSIONS[key as RoleKey] ?? []),
      },
    });
    roleIdByKey[key] = role.id;
  }

  // --- Para birimleri, birimler, vergiler ---
  const currencies = [
    { code: "TRY", name: "Türk Lirası", symbol: "₺" },
    { code: "USD", name: "ABD Doları", symbol: "$" },
    { code: "EUR", name: "Euro", symbol: "€" },
  ];
  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { tenantId_code: { tenantId, code: c.code } },
      update: {},
      create: { tenantId, ...c },
    });
  }
  const uoms = [
    { code: "AD", name: "Adet" },
    { code: "KG", name: "Kilogram" },
    { code: "MT", name: "Metre" },
    { code: "M2", name: "Metrekare" },
    { code: "LT", name: "Litre" },
    { code: "PK", name: "Paket" },
    { code: "ST", name: "Saat" },
  ];
  for (const u of uoms) {
    await prisma.unitOfMeasure.upsert({
      where: { tenantId_code: { tenantId, code: u.code } },
      update: {},
      create: { tenantId, ...u },
    });
  }
  const taxCodes = [
    { code: "KDV20", name: "KDV %20", kind: "VAT", rate: "20" },
    { code: "KDV10", name: "KDV %10", kind: "VAT", rate: "10" },
    { code: "KDV01", name: "KDV %1", kind: "VAT", rate: "1" },
    { code: "TEV50", name: "Tevkifat 5/10", kind: "WITHHOLDING", rate: "20", withholdingRatio: JSON.stringify({ numerator: 5, denominator: 10 }) },
  ];
  for (const t of taxCodes) {
    await prisma.taxCode.upsert({
      where: { tenantId_code: { tenantId, code: t.code } },
      update: {},
      create: { tenantId, ...t },
    });
  }

  // --- Kur (mock) ---
  const today = new Date();
  for (const [quote, rate] of [["USD", "34.20"], ["EUR", "37.10"]] as const) {
    await prisma.exchangeRate.upsert({
      where: { tenantId_base_quote_rateDate_source: { tenantId, base: "TRY", quote, rateDate: new Date(today.toDateString()), source: "MOCK" } },
      update: { rate },
      create: { tenantId, base: "TRY", quote, rate, source: "MOCK", rateDate: new Date(today.toDateString()) },
    });
  }

  // --- Kategoriler ---
  const categoryNames = ["Hammadde", "Bakır/Alüminyum", "Yalıtım Malzemeleri", "Elektrik Malzeme", "MRO/Sarf", "Ambalaj", "Hizmet", "Yedek Parça"];
  const categoryIdByName: Record<string, string> = {};
  for (const [i, name] of categoryNames.entries()) {
    const c = await prisma.category.upsert({
      where: { tenantId_code: { tenantId, code: `KAT${String(i + 1).padStart(2, "0")}` } },
      update: {},
      create: { tenantId, code: `KAT${String(i + 1).padStart(2, "0")}`, name },
    });
    categoryIdByName[name] = c.id;
  }

  // --- Şirketler / organizasyon ---
  const company = await prisma.company.upsert({
    where: { tenantId_code: { tenantId, code: "COIL" } },
    update: {},
    create: {
      tenantId, code: "COIL", name: "Coil Partners A.Ş.", legalName: "Coil Partners Bobinaj San. ve Tic. A.Ş.",
      taxOffice: "Kocaeli", taxNumber: "1234567890", baseCurrency: "TRY",
    },
  });
  const site = await prisma.site.upsert({
    where: { companyId_code: { companyId: company.id, code: "GEBZE" } },
    update: {},
    create: { companyId: company.id, code: "GEBZE", name: "Gebze Fabrika" },
  });
  const departments = [
    { code: "URE", name: "Üretim" },
    { code: "BAK", name: "Bakım" },
    { code: "KAL", name: "Kalite" },
    { code: "SAT", name: "Satınalma" },
    { code: "PRJ", name: "Proje" },
  ];
  const deptIdByCode: Record<string, string> = {};
  for (const d of departments) {
    const dep = await prisma.department.upsert({
      where: { companyId_code: { companyId: company.id, code: d.code } },
      update: {},
      create: { companyId: company.id, siteId: site.id, code: d.code, name: d.name },
    });
    deptIdByCode[d.code] = dep.id;
  }
  const costCenter = await prisma.costCenter.upsert({
    where: { companyId_code: { companyId: company.id, code: "MC100" } },
    update: {},
    create: { companyId: company.id, code: "MC100", name: "Üretim Maliyet Merkezi" },
  });
  const project = await prisma.project.upsert({
    where: { companyId_code: { companyId: company.id, code: "PRJ-EXP-01" } },
    update: {},
    create: { companyId: company.id, code: "PRJ-EXP-01", name: "Almanya İhracat Trafo Projesi", currency: "EUR", budgetAmount: "500000" },
  });
  await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: "AMB01" } },
    update: {},
    create: { companyId: company.id, siteId: site.id, code: "AMB01", name: "Ana Ambar" },
  });

  // --- Kullanıcılar ---
  async function createUser(email: string, name: string, title: string, roleKey: string, opts: { departmentId?: string; managerId?: string; isSystemAdmin?: boolean; locale?: string } = {}) {
    const u = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: {},
      create: {
        tenantId, email, name, title, passwordHash,
        departmentId: opts.departmentId ?? null,
        managerId: opts.managerId ?? null,
        isSystemAdmin: opts.isSystemAdmin ?? false,
        locale: opts.locale ?? "tr",
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: u.id, roleId: roleIdByKey[roleKey]! } },
      update: {},
      create: { userId: u.id, roleId: roleIdByKey[roleKey]! },
    });
    return u;
  }

  const admin = await createUser("admin@coilpartners.com", "Sistem Yöneticisi", "BT Yöneticisi", ROLE_KEYS.SYSTEM_ADMIN, { isSystemAdmin: true });
  const amir = await createUser("amir@coilpartners.com", "Ahmet Yılmaz", "Üretim Müdürü", ROLE_KEYS.DEPT_MANAGER, { departmentId: deptIdByCode.URE });
  const pmanager = await createUser("satinalma.md@coilpartners.com", "Zeynep Kaya", "Satınalma Müdürü", ROLE_KEYS.PURCHASING_MANAGER, { departmentId: deptIdByCode.SAT });
  const specialist = await createUser("satinalma@coilpartners.com", "Mehmet Demir", "Satınalma Uzmanı", ROLE_KEYS.PURCHASING_SPECIALIST, { departmentId: deptIdByCode.SAT, managerId: pmanager.id });
  const requester = await createUser("talep@coilpartners.com", "Ali Veli", "Üretim Mühendisi", ROLE_KEYS.REQUESTER, { departmentId: deptIdByCode.URE, managerId: amir.id });
  const finance = await createUser("finans@coilpartners.com", "Fatma Şahin", "Finans Müdürü", ROLE_KEYS.FINANCE_APPROVER, { departmentId: deptIdByCode.SAT });
  await createUser("depo@coilpartners.com", "Hasan Depo", "Depo Sorumlusu", ROLE_KEYS.WAREHOUSE_USER, { departmentId: deptIdByCode.URE });
  await createUser("kalite@coilpartners.com", "Elif Kalite", "Kalite Mühendisi", ROLE_KEYS.QUALITY_USER, { departmentId: deptIdByCode.KAL });
  await createUser("muhasebe@coilpartners.com", "Deniz Muhasebe", "Muhasebe Uzmanı", ROLE_KEYS.ACCOUNTING_USER, { departmentId: deptIdByCode.SAT });

  // Departman amiri ilişkisi
  await prisma.department.update({ where: { id: deptIdByCode.URE! }, data: { managerId: amir.id } });

  // --- Onay akışları ---
  // Talep akışı
  const reqWf = await prisma.approvalWorkflow.upsert({
    where: { tenantId_key: { tenantId, key: "REQ_DEFAULT" } },
    update: {},
    create: { tenantId, key: "REQ_DEFAULT", name: "Talep Onay Akışı", documentType: "REQUISITION" },
  });
  // Yüksek tutar kuralı (>= 50.000) önce kontrol edilir
  const reqRuleHigh = await prisma.approvalRule.create({
    data: { workflowId: reqWf.id, name: "Yüksek Tutar (≥50.000)", priority: 0, conditions: JSON.stringify({ minAmount: "50000" }) },
  });
  await prisma.approvalStep.createMany({
    data: [
      { ruleId: reqRuleHigh.id, sequence: 0, name: "Departman Amiri", approverType: "DEPARTMENT_MANAGER" },
      { ruleId: reqRuleHigh.id, sequence: 1, name: "Satınalma Müdürü", approverType: "ROLE", approverValue: ROLE_KEYS.PURCHASING_MANAGER },
      { ruleId: reqRuleHigh.id, sequence: 2, name: "Finans Onayı", approverType: "ROLE", approverValue: ROLE_KEYS.FINANCE_APPROVER },
    ],
  });
  const reqRuleStd = await prisma.approvalRule.create({
    data: { workflowId: reqWf.id, name: "Standart", priority: 10, conditions: JSON.stringify({}) },
  });
  await prisma.approvalStep.createMany({
    data: [
      { ruleId: reqRuleStd.id, sequence: 0, name: "Departman Amiri", approverType: "DEPARTMENT_MANAGER" },
      { ruleId: reqRuleStd.id, sequence: 1, name: "Satınalma Müdürü", approverType: "ROLE", approverValue: ROLE_KEYS.PURCHASING_MANAGER },
    ],
  });

  // Sipariş akışı
  const poWf = await prisma.approvalWorkflow.upsert({
    where: { tenantId_key: { tenantId, key: "PO_DEFAULT" } },
    update: {},
    create: { tenantId, key: "PO_DEFAULT", name: "Sipariş Onay Akışı", documentType: "PURCHASE_ORDER" },
  });
  const poRuleHigh = await prisma.approvalRule.create({
    data: { workflowId: poWf.id, name: "Yüksek Tutar (≥50.000)", priority: 0, conditions: JSON.stringify({ minAmount: "50000" }) },
  });
  await prisma.approvalStep.createMany({
    data: [
      { ruleId: poRuleHigh.id, sequence: 0, name: "Satınalma Müdürü", approverType: "ROLE", approverValue: ROLE_KEYS.PURCHASING_MANAGER },
      { ruleId: poRuleHigh.id, sequence: 1, name: "Finans/Yönetim Onayı", approverType: "ROLE", approverValue: ROLE_KEYS.FINANCE_APPROVER },
    ],
  });
  const poRuleStd = await prisma.approvalRule.create({
    data: { workflowId: poWf.id, name: "Standart", priority: 10, conditions: JSON.stringify({}) },
  });
  await prisma.approvalStep.create({
    data: { ruleId: poRuleStd.id, sequence: 0, name: "Satınalma Müdürü", approverType: "ROLE", approverValue: ROLE_KEYS.PURCHASING_MANAGER },
  });

  // --- Ürünler ---
  const items = [
    { code: "HM-CU-001", name: "Elektrolitik Bakır Tel 2mm", category: "Bakır/Alüminyum", uom: "KG", brand: "Sarkuysan", price: "310.00" },
    { code: "HM-AL-001", name: "Alüminyum Levha 1050 H14", category: "Bakır/Alüminyum", uom: "KG", brand: "Assan", price: "185.00" },
    { code: "YL-KG-001", name: "Nomex Yalıtım Kağıdı 0.25mm", category: "Yalıtım Malzemeleri", uom: "M2", brand: "DuPont", price: "95.00" },
    { code: "EL-TR-001", name: "Trafo Sac Paketi M4", category: "Elektrik Malzeme", uom: "KG", brand: "ThyssenKrupp", price: "78.00" },
    { code: "MRO-YAG-01", name: "Trafo Yalıtım Yağı", category: "MRO/Sarf", uom: "LT", brand: "Shell", price: "62.00" },
    { code: "AMB-PAL-01", name: "Ahşap Palet 120x100", category: "Ambalaj", uom: "AD", brand: "-", price: "180.00" },
    { code: "YP-RLM-01", name: "Rulman 6205 ZZ", category: "Yedek Parça", uom: "AD", brand: "SKF", price: "145.00" },
    { code: "HZ-BAK-01", name: "Periyodik Bakım Hizmeti", category: "Hizmet", uom: "ST", brand: "-", price: "850.00", isService: true },
  ];
  const uomIdByCode: Record<string, string> = {};
  for (const u of await prisma.unitOfMeasure.findMany({ where: { tenantId } })) uomIdByCode[u.code] = u.id;
  for (const it of items) {
    await prisma.item.upsert({
      where: { tenantId_code: { tenantId, code: it.code } },
      update: {},
      create: {
        tenantId, code: it.code, name: it.name, categoryId: categoryIdByName[it.category],
        baseUomId: uomIdByCode[it.uom], brand: it.brand, isService: it.isService ?? false,
        lastPurchasePrice: it.price, lastPurchaseCurrency: "TRY",
      },
    });
  }

  // --- Tedarikçiler (yerli + yabancı) ---
  const suppliers = [
    { code: "TED-2026-000001", legalName: "Sarkuysan Elektrolitik Bakır A.Ş.", type: "DOMESTIC", country: "TR", lang: "tr", cur: "TRY", cats: ["Bakır/Alüminyum"], ops: ["DOMESTIC_PURCHASE"] },
    { code: "TED-2026-000002", legalName: "Assan Alüminyum San. ve Tic. A.Ş.", type: "DOMESTIC", country: "TR", lang: "tr", cur: "TRY", cats: ["Bakır/Alüminyum"], ops: ["DOMESTIC_PURCHASE"] },
    { code: "TED-2026-000003", legalName: "DuPont de Nemours GmbH", type: "FOREIGN", country: "DE", lang: "en", cur: "EUR", cats: ["Yalıtım Malzemeleri"], ops: ["IMPORT_PURCHASE"] },
    { code: "TED-2026-000004", legalName: "ThyssenKrupp Electrical Steel GmbH", type: "FOREIGN", country: "DE", lang: "en", cur: "EUR", cats: ["Elektrik Malzeme"], ops: ["IMPORT_PURCHASE"] },
    { code: "TED-2026-000005", legalName: "Shell Türkiye Petrol A.Ş.", type: "DOMESTIC", country: "TR", lang: "tr", cur: "TRY", cats: ["MRO/Sarf"], ops: ["DOMESTIC_PURCHASE"] },
    { code: "TED-2026-000006", legalName: "SKF Türk Sanayi A.Ş.", type: "DOMESTIC", country: "TR", lang: "tr", cur: "TRY", cats: ["Yedek Parça"], ops: ["DOMESTIC_PURCHASE"] },
    { code: "TED-2026-000007", legalName: "Nexans Magnet Wire France SAS", type: "FOREIGN", country: "FR", lang: "en", cur: "EUR", cats: ["Bakır/Alüminyum"], ops: ["IMPORT_PURCHASE", "EXPORT_RELATED_PURCHASE"] },
    { code: "TED-2026-000008", legalName: "Von Roll Insulation AG", type: "FOREIGN", country: "CH", lang: "en", cur: "EUR", cats: ["Yalıtım Malzemeleri"], ops: ["IMPORT_PURCHASE"] },
    { code: "TED-2026-000009", legalName: "Ege Ambalaj San. Ltd. Şti.", type: "DOMESTIC", country: "TR", lang: "tr", cur: "TRY", cats: ["Ambalaj"], ops: ["DOMESTIC_PURCHASE"] },
    { code: "TED-2026-000010", legalName: "Marmara Endüstriyel Bakım Ltd.", type: "DOMESTIC", country: "TR", lang: "tr", cur: "TRY", cats: ["Hizmet"], ops: ["DOMESTIC_PURCHASE"] },
    { code: "TED-2026-000011", legalName: "Baosteel Trading Co. Ltd.", type: "FOREIGN", country: "CN", lang: "en", cur: "USD", cats: ["Elektrik Malzeme"], ops: ["IMPORT_PURCHASE"] },
    { code: "TED-2026-000012", legalName: "ABB Elektrik San. A.Ş.", type: "DOMESTIC", country: "TR", lang: "tr", cur: "TRY", cats: ["Elektrik Malzeme"], ops: ["DOMESTIC_PURCHASE"] },
    { code: "TED-2026-000013", legalName: "Anadolu Metal Tic. A.Ş.", type: "DOMESTIC", country: "TR", lang: "tr", cur: "TRY", cats: ["Bakır/Alüminyum"], ops: ["DOMESTIC_PURCHASE"] },
    { code: "TED-2026-000014", legalName: "Weidmann Electrical Technology", type: "FOREIGN", country: "CH", lang: "en", cur: "EUR", cats: ["Yalıtım Malzemeleri"], ops: ["IMPORT_PURCHASE"] },
    { code: "TED-2026-000015", legalName: "Global Logistics & Forwarding Ltd.", type: "FOREIGN", country: "NL", lang: "en", cur: "EUR", cats: ["Hizmet"], ops: ["IMPORT_PURCHASE", "EXPORT_RELATED_PURCHASE"] },
  ];
  const supplierIdByCode: Record<string, string> = {};
  for (const s of suppliers) {
    const created = await prisma.supplier.upsert({
      where: { tenantId_code: { tenantId, code: s.code } },
      update: {},
      create: {
        tenantId, code: s.code, legalName: s.legalName, supplierType: s.type,
        country: s.country, preferredLanguage: s.lang, defaultCurrency: s.cur,
        status: "ACTIVE", riskLevel: "LOW", paymentTermDays: 60, defaultPaymentTermDays: 60,
        operationTypes: JSON.stringify(s.ops),
        currencies: JSON.stringify([s.cur]),
        isExporter: s.type === "FOREIGN",
        contacts: {
          create: {
            name: s.lang === "en" ? "Sales Department" : "Satış Departmanı",
            email: `satis@${s.code.toLowerCase().replace(/[^a-z0-9]/g, "")}.example`,
            phone: "+90 262 000 00 00", isPrimary: true,
          },
        },
        bankAccounts: {
          create: {
            bankName: s.type === "FOREIGN" ? "Deutsche Bank AG" : "Türkiye İş Bankası",
            iban: s.type === "FOREIGN" ? "DE89370400440532013000" : "TR330006100519786457841326",
            swiftBic: s.type === "FOREIGN" ? "DEUTDEFF" : "ISBKTRIS",
            currency: s.cur, status: "APPROVED", accountHolder: s.legalName,
          },
        },
        categories: { create: s.cats.map((c) => ({ categoryId: categoryIdByName[c]! })) },
      },
    });
    supplierIdByCode[s.code] = created.id;

    // Performans skoru
    await prisma.supplierScore.create({
      data: {
        supplierId: created.id, period: "2026-Q1",
        purchasingScore: (35 + Math.floor((created.id.charCodeAt(0) % 15))).toString(),
        qualityScore: (30 + Math.floor((created.id.charCodeAt(1) % 20))).toString(),
        purchasingClass: "P1", qualityClass: "Q1",
      },
    });
  }

  // --- Bütçeler ---
  await prisma.budget.create({
    data: {
      tenantId, companyId: company.id, costCenterId: costCenter.id, fiscalYear: 2026,
      currency: "TRY", plannedAmount: "5000000",
      transactions: { create: [{ type: "COMMIT", amount: "1250000", note: "Q1 taahhütleri" }] },
    },
  });
  await prisma.budget.create({
    data: {
      tenantId, companyId: company.id, projectId: project.id, fiscalYear: 2026,
      currency: "EUR", plannedAmount: "500000",
      transactions: { create: [{ type: "COMMIT", amount: "82000", note: "İhracat projesi malzeme" }] },
    },
  });

  // --- Demo işlem: onaylı sipariş + fatura (dashboard/rapor için) ---
  const demoSupplierId = supplierIdByCode["TED-2026-000001"]!;
  const demoPo = await prisma.purchaseOrder.create({
    data: {
      tenantId, number: "SIP-2026-000001", companyId: company.id, supplierId: demoSupplierId,
      status: "CONFIRMED", operationType: "DOMESTIC_PURCHASE", currency: "TRY",
      subtotal: "155000", taxTotal: "31000", grandTotal: "186000", createdById: specialist.id,
      paymentTerms: "60 gün", incoterm: "EXW",
      lines: {
        create: [
          { lineNo: 1, description: "Elektrolitik Bakır Tel 2mm", quantity: "500", uom: "KG", unitPrice: "310", taxRate: "20", lineTotal: "155000", confirmedQty: "500" },
        ],
      },
    },
  });
  await prisma.invoice.create({
    data: {
      tenantId, supplierId: demoSupplierId, orderId: demoPo.id, number: "FT2026000123",
      invoiceDate: new Date(), dueDate: new Date(Date.now() + 60 * 86400000),
      currency: "TRY", netAmount: "155000", taxAmount: "31000", grandTotal: "186000", payableAmount: "186000",
      status: "MATCHED", source: "MANUAL",
      lines: { create: [{ description: "Elektrolitik Bakır Tel 2mm", quantity: "500", unitPrice: "310", taxRate: "20", lineTotal: "155000" }] },
    },
  });

  // İthalat siparişi örneği (landed cost ile)
  const importSupplierId = supplierIdByCode["TED-2026-000004"]!;
  await prisma.purchaseOrder.create({
    data: {
      tenantId, number: "SIP-2026-000002", companyId: company.id, supplierId: importSupplierId,
      status: "SHIPPED", operationType: "IMPORT_PURCHASE", language: "en", currency: "EUR",
      supplierCountry: "DE", originCountry: "DE", transportMode: "SEA", incoterm: "FOB", incotermLocation: "Hamburg",
      paymentMethod: "LC", subtotal: "42000", taxTotal: "0", grandTotal: "42000", landedCostTotal: "6800",
      createdById: specialist.id,
      lines: { create: [{ lineNo: 1, description: "Trafo Sac Paketi M4", quantity: "8000", uom: "KG", unitPrice: "5.25", taxRate: "0", lineTotal: "42000", weight: "8000", allocatedLandedCost: "6800" }] },
      landedCosts: {
        create: [
          { costType: "FREIGHT", description: "Deniz navlunu", amount: "3200", currency: "EUR", allocationMethod: "WEIGHT" },
          { costType: "CUSTOMS_DUTY", description: "Gümrük vergisi", amount: "2500", currency: "EUR", allocationMethod: "VALUE" },
          { costType: "BROKERAGE", description: "Gümrük müşavirliği", amount: "1100", currency: "EUR", allocationMethod: "VALUE" },
        ],
      },
    },
  });

  console.log("✔ Seed tamamlandı.");
  console.log(`\nDemo giriş bilgileri (parola: ${DEMO_PASSWORD}):`);
  console.log("  admin@coilpartners.com          → Sistem Yöneticisi");
  console.log("  satinalma.md@coilpartners.com   → Satınalma Müdürü");
  console.log("  satinalma@coilpartners.com      → Satınalma Uzmanı");
  console.log("  talep@coilpartners.com          → Talep Sahibi");
  console.log("  amir@coilpartners.com           → Departman Amiri");
  console.log("  finans@coilpartners.com         → Finans Onaycısı");
  console.log("  depo@ / kalite@ / muhasebe@coilpartners.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
