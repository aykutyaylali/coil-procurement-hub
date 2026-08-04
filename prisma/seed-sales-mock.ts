/**
 * Satış & CRM (Sales CRM & CPQ) modülü için MOCK demo verisi.
 * ÖN KOŞUL: `prisma db seed` (seed.ts) çalışmış olmalı (tenant/şirket/kullanıcı).
 * Idempotent'tir: "DMU-" kodlu demo müşteriler ve bağlı RFQ/Teklif/Not/Teknik
 * kayıtları önce silinir, sonra yeniden oluşturulur. Gerçek (MUS-) veriye dokunmaz.
 *
 * Üretir: onaylı LME referansı (yoksa) + 8 Müşteri + 12 RFQ (tüm durumlar) +
 * 10 Teklif (OPEN/ORDER/CLOSED/REJECTED, EUR/USD/TRY, teknik detay + LME ref +
 * revizyon + fatura + notlar). Pipeline/dönüşüm/trend panelini doldurur.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const money = (v: number) => v.toFixed(2);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
const monthsAgo = (m: number) => { const dt = new Date(); dt.setMonth(dt.getMonth() - m); return dt; };

async function main() {
  console.log("Satış demo verisi seed başlıyor…");
  const tenant = await prisma.tenant.findFirst({ where: { slug: "coil-partners" } }) ?? await prisma.tenant.findFirstOrThrow();
  const tenantId = tenant.id;
  // Demo, ortama özgü sabit e-postalara bağlı değildir: tenant'taki aktif kullanıcıları kullanır.
  const reps = await prisma.user.findMany({ where: { tenantId, isActive: true }, select: { id: true }, orderBy: { email: "asc" }, take: 4 });
  const specialist = reps[0] ? { id: reps[0].id } : await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } });
  const repId = (i: number) => reps[i % reps.length]?.id ?? specialist.id;

  // 0) Eski demo verisini temizle (DMU- kodlu müşteriler ve bağlıları)
  const oldCustomers = await prisma.customer.findMany({ where: { tenantId, code: { startsWith: "DMU-" } }, select: { id: true } });
  const oldIds = oldCustomers.map((c) => c.id);
  if (oldIds.length) {
    await prisma.salesOffer.deleteMany({ where: { tenantId, customerId: { in: oldIds } } }); // tech/notes/docs cascade
    await prisma.salesRFQ.deleteMany({ where: { tenantId, customerId: { in: oldIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: oldIds } } });
    console.log(`  Eski demo temizlendi: ${oldIds.length} müşteri`);
  }

  // 1) Onaylı LME referansı (yoksa 2 adet oluştur) — teklif LME panelinde görünür
  let lme = await prisma.lmeRecord.findMany({ where: { tenantId, status: "APPROVED" }, orderBy: { priceDate: "desc" }, take: 3, select: { id: true } });
  if (lme.length === 0) {
    const mk = async (priceDate: Date, usdPerTon: string, kind: string) =>
      prisma.lmeRecord.create({ data: { tenantId, priceDate, usdPerTon, kind, status: "APPROVED", source: "Demo referans", createdById: specialist.id, approvedById: specialist.id, approvedAt: new Date(), note: "Demo LME" } });
    await mk(daysAgo(7), "9520.00", "DAILY_SPOT");
    await mk(daysAgo(14), "9480.00", "WEEKLY_AVG");
    lme = await prisma.lmeRecord.findMany({ where: { tenantId, status: "APPROVED" }, orderBy: { priceDate: "desc" }, take: 3, select: { id: true } });
    console.log("  Demo LME referansı eklendi (2)");
  }
  const lmeId = (i: number) => lme[i % lme.length]?.id ?? null;

  // 2) Müşteriler
  const custDefs = [
    { name: "Anadolu Motor Sanayi A.Ş.", country: "TR", industry: "OEM", cur: "TRY", contact: "Mehmet Yıldız" },
    { name: "Siemens Energy GmbH", country: "DE", industry: "UTILITY", cur: "EUR", contact: "Klaus Weber" },
    { name: "GE Renewable Corp.", country: "US", industry: "UTILITY", cur: "USD", contact: "John Miller" },
    { name: "Ege Bobinaj ve Sarım Ltd.", country: "TR", industry: "REPAIR", cur: "TRY", contact: "Ayşe Demir" },
    { name: "Nidec Leroy-Somer", country: "FR", industry: "OEM", cur: "EUR", contact: "Pierre Laurent" },
    { name: "Marelli Motori S.p.A.", country: "IT", industry: "OEM", cur: "EUR", contact: "Marco Rossi" },
    { name: "Baklan Elektrik Makine", country: "TR", industry: "REPAIR", cur: "TRY", contact: "Hasan Kaya" },
    { name: "WEG Electric Ltd.", country: "US", industry: "OTHER", cur: "USD", contact: "Sarah Johnson" },
  ];
  const customers: { id: string; cur: string; industry: string }[] = [];
  for (let i = 0; i < custDefs.length; i++) {
    const c = custDefs[i]!;
    const created = await prisma.customer.create({
      data: {
        tenantId, code: `DMU-${String(i + 1).padStart(4, "0")}`, name: c.name, country: c.country, industry: c.industry,
        defaultCurrency: c.cur, contactName: c.contact, contactEmail: `info@${c.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}.example`,
        salesRepId: repId(i), isActive: true, createdById: specialist.id, notes: "Demo müşteri kaydı.",
      },
      select: { id: true },
    });
    customers.push({ id: created.id, cur: c.cur, industry: c.industry });
  }
  console.log(`  Müşteri: ${customers.length}`);

  // 3) RFQ'ler (tüm durumlar; trend için farklı tarihler)
  const rfqStatuses = ["REQUEST", "REQUEST", "IN_PROCESS", "IN_PROCESS", "OFFERED", "OFFERED", "OFFERED", "OFFERED", "REJECTED", "OFFERED", "IN_PROCESS", "OFFERED"];
  const coilTypes = ["STATOR_COIL", "ROTOR_COIL", "POLE", "OTHER"];
  const rfqs: { id: string; custIdx: number; status: string }[] = [];
  for (let i = 0; i < rfqStatuses.length; i++) {
    const custIdx = i % customers.length;
    const created = await prisma.salesRFQ.create({
      data: {
        tenantId, number: `SRFQ-2026-95${String(i + 1).padStart(2, "0")}`, customerId: customers[custIdx]!.id,
        industry: customers[custIdx]!.industry, status: rfqStatuses[i]!, requestDate: daysAgo(120 - i * 8),
        salesRepId: repId(i), coilType: coilTypes[i % coilTypes.length], notes: `Demo talep #${i + 1}.`,
        createdById: specialist.id,
      },
      select: { id: true },
    });
    rfqs.push({ id: created.id, custIdx, status: rfqStatuses[i]! });
  }
  console.log(`  RFQ: ${rfqs.length}`);

  // 4) Teklifler (OFFERED RFQ'lere bağlı; durum/kur/tutar/teknik çeşitli)
  const offeredRfqs = rfqs.filter((r) => r.status === "OFFERED");
  const offerPlan = [
    { status: "ORDER", amount: 1250000, months: 5, rev: 1, invoiced: true },
    { status: "OPEN", amount: 84500, months: 1, rev: 0, invoiced: false },
    { status: "OPEN", amount: 132000, months: 0, rev: 0, invoiced: false },
    { status: "CLOSED", amount: 47500, months: 4, rev: 2, invoiced: false },
    { status: "ORDER", amount: 96000, months: 3, rev: 0, invoiced: true },
    { status: "REJECTED", amount: 210000, months: 2, rev: 1, invoiced: false },
    { status: "ORDER", amount: 305000, months: 2, rev: 0, invoiced: true },
    { status: "OPEN", amount: 58900, months: 0, rev: 0, invoiced: false },
    { status: "CLOSED", amount: 74000, months: 6, rev: 0, invoiced: false },
    { status: "OPEN", amount: 168000, months: 1, rev: 1, invoiced: false },
  ];
  const techPresets = [
    { manufacturer: "Siemens", type: "1LE1501", power: "500", voltage: "400", numberOfPole: 4, numberOfCoils: 48, numberOfSlot: 48, numberOfSet: 3, numberOfTurns: 12, insulationType: "F", typeOfCoil: "STATOR_COIL", wireWidth: "2.50", wireThickness: "1.80" },
    { manufacturer: "ABB", type: "M3BP", power: "250", voltage: "690", numberOfPole: 6, numberOfCoils: 72, numberOfSlot: 72, numberOfSet: 3, numberOfTurns: 18, insulationType: "H", typeOfCoil: "ROTOR_COIL", wireWidth: "1.60", wireThickness: "1.20" },
    { manufacturer: "WEG", type: "W22", power: "1500", voltage: "6000", numberOfPole: 8, numberOfCoils: 96, numberOfSlot: 96, numberOfSet: 6, numberOfTurns: 8, insulationType: "F", typeOfCoil: "POLE", wireWidth: "3.15", wireThickness: "2.24" },
  ];
  let offerCount = 0, noteCount = 0;
  for (let i = 0; i < offerPlan.length; i++) {
    const p = offerPlan[i]!;
    const rfq = offeredRfqs[i % offeredRfqs.length]!;
    const cust = customers[rfq.custIdx]!;
    const tp = techPresets[i % techPresets.length]!;
    const offer = await prisma.salesOffer.create({
      data: {
        tenantId, number: `CP95${String(i + 1).padStart(2, "0")}`, salesRfqId: rfq.id, customerId: cust.id,
        status: p.status, currency: cust.cur, totalAmount: money(p.amount), offerDate: monthsAgo(p.months),
        validUntil: daysAgo(-30), deliveryDate: daysAgo(-45), revisionNo: p.rev, revisionDate: p.rev > 0 ? daysAgo(20) : null,
        invoiced: p.invoiced, salesRepId: repId(i), createdById: specialist.id,
        reason: p.status === "REJECTED" ? "Fiyat rekabeti — kaybedildi." : p.status === "CLOSED" ? "Proje ertelendi." : null,
        technicalDetail: { create: { ...tp, lmeRecordId: lmeId(i) } },
      },
      select: { id: true },
    });
    offerCount++;
    if (i % 3 === 0) {
      await prisma.salesOfferNote.create({ data: { offerId: offer.id, title: "Müşteri görüşmesi", body: `**Teknik toplantı** yapıldı.\n- Teslim süresi netleşti\n- *Numune* talep edildi`, createdById: repId(i) } });
      noteCount++;
    }
  }
  console.log(`  Teklif: ${offerCount} (not: ${noteCount})`);
  console.log("\n✔ Satış demo verisi tamamlandı.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
