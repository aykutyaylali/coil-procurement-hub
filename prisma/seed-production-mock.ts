/**
 * Üretim Saha Yönetimi (MES / Shop Floor) modülü için MOCK demo verisi.
 * ÖN KOŞUL: `prisma db seed` (seed.ts) çalışmış olmalı (tenant/kullanıcı).
 * Idempotent: "WO-DEMO-" iş emirleri (+ log'ları) ve "EMP-" rozetli operatörler
 * önce silinir, sonra yeniden oluşturulur. İstasyonlar (master) upsert edilir.
 *
 * Üretir: 10 istasyon + 8 operatör + ~10 iş emri (tüm durumlar) + üretim log'ları
 * (açık/kapalı oturumlar, üretim/fire). Üretim panosu ve terminali doldurur.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const STATIONS = [
  { code: "LO", name: "Loading / Sarım Hazırlık", sequence: 1, defaultMinutes: 30 },
  { code: "PRO", name: "Profilleme (Profiling)", sequence: 2, defaultMinutes: 45 },
  { code: "SPR", name: "Spreading / Yayma", sequence: 3, defaultMinutes: 40 },
  { code: "CNS", name: "Consolidation / Presleme", sequence: 4, defaultMinutes: 35 },
  { code: "NOMEX", name: "Nomex İzolasyon", sequence: 5, defaultMinutes: 50 },
  { code: "THO", name: "Termal İşlem (Thermal)", sequence: 6, defaultMinutes: 60 },
  { code: "TEST", name: "Ara Test", sequence: 7, defaultMinutes: 25 },
  { code: "SURGE", name: "Surge Test", sequence: 8, defaultMinutes: 20 },
  { code: "HV", name: "Yüksek Gerilim (HV) Test", sequence: 9, defaultMinutes: 25 },
  { code: "PACKAGE", name: "Paketleme (Package)", sequence: 10, defaultMinutes: 30 },
];

const LINES = ["LINE-2", "LINE-3", "LINE-4", "LINE-5"];
const COIL_TYPES = ["STATOR_COIL", "ROTOR_COIL", "POLE", "OTHER"];
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000);
const minsAgo = (m: number) => new Date(Date.now() - m * 60000);

async function main() {
  console.log("Üretim demo verisi seed başlıyor…");
  const tenant = (await prisma.tenant.findFirst({ where: { slug: "coil-partners" } })) ?? (await prisma.tenant.findFirstOrThrow());
  const tenantId = tenant.id;
  const owner = await prisma.user.findFirst({ where: { tenantId, isActive: true }, select: { id: true }, orderBy: { email: "asc" } });
  const createdById = owner?.id ?? (await prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;

  // 0) Eski demo temizliği: WO-DEMO- iş emirleri (log'lar cascade) + EMP- operatörler
  const oldWOs = await prisma.workOrder.findMany({ where: { tenantId, number: { startsWith: "WO-DEMO-" } }, select: { id: true } });
  if (oldWOs.length) {
    await prisma.workOrder.deleteMany({ where: { id: { in: oldWOs.map((w) => w.id) } } }); // ProductionLog cascade
    console.log(`  Eski demo iş emri temizlendi: ${oldWOs.length}`);
  }
  await prisma.productionOperator.deleteMany({ where: { tenantId, badgeCode: { startsWith: "EMP-" } } });

  // 1) İstasyonlar (master) — upsert
  const stationByCode: Record<string, string> = {};
  for (const s of STATIONS) {
    const st = await prisma.productionStation.upsert({
      where: { tenantId_code: { tenantId, code: s.code } },
      create: { tenantId, ...s, isActive: true },
      update: { name: s.name, sequence: s.sequence, defaultMinutes: s.defaultMinutes, isActive: true },
    });
    stationByCode[s.code] = st.id;
  }
  console.log(`  İstasyon: ${STATIONS.length} (upsert)`);

  // 2) Operatörler
  const opDefs = [
    { name: "Ahmet Kılıç", line: "LINE-2", title: "Sarım Operatörü" },
    { name: "Mehmet Demir", line: "LINE-2", title: "Sarım Operatörü" },
    { name: "Fatih Şahin", line: "LINE-3", title: "Presleme Operatörü" },
    { name: "Hüseyin Aydın", line: "LINE-3", title: "İzolasyon Operatörü" },
    { name: "Emre Yıldız", line: "LINE-4", title: "Test Operatörü" },
    { name: "Serkan Öztürk", line: "LINE-4", title: "Termal Operatörü" },
    { name: "Burak Çelik", line: "LINE-5", title: "Paketleme Operatörü" },
    { name: "Okan Arslan", line: "LINE-5", title: "Vardiya Amiri" },
  ];
  const operators: { id: string; line: string }[] = [];
  for (let i = 0; i < opDefs.length; i++) {
    const o = opDefs[i]!;
    const created = await prisma.productionOperator.create({
      data: { tenantId, employeeNo: `PER-${101 + i}`, name: o.name, badgeCode: `EMP-${101 + i}`, line: o.line, title: o.title, isActive: true },
      select: { id: true },
    });
    operators.push({ id: created.id, line: o.line });
  }
  console.log(`  Operatör: ${operators.length}`);

  // Müşteri adları — varsa demo müşterileri kullan, yoksa serbest metin
  const demoCustomers = await prisma.customer.findMany({ where: { tenantId }, select: { id: true, name: true }, take: 8, orderBy: { name: "asc" } });
  const custName = (i: number) => demoCustomers[i % Math.max(1, demoCustomers.length)]?.name ?? ["ABB ITALY", "SIEMENS", "WEG", "GE", "ETİ ALÜMİNYUM", "IDEAL", "EMRI", "FLENDER"][i % 8];
  const custId = (i: number) => demoCustomers[i % Math.max(1, demoCustomers.length)]?.id ?? null;

  // 3) İş emirleri
  const woPlan = [
    { status: "IN_PROGRESS", line: "LINE-2", target: 20, done: 12 },
    { status: "IN_PROGRESS", line: "LINE-4", target: 130, done: 74 },
    { status: "IN_PROGRESS", line: "LINE-4", target: 75, done: 40 },
    { status: "IN_PROGRESS", line: "LINE-2", target: 6, done: 3 },
    { status: "IN_PROGRESS", line: "LINE-5", target: 72, done: 50 },
    { status: "PLANNED", line: "LINE-3", target: 92, done: 0 },
    { status: "PLANNED", line: "LINE-5", target: 85, done: 0 },
    { status: "COMPLETED", line: "LINE-2", target: 10, done: 10 },
    { status: "COMPLETED", line: "LINE-4", target: 62, done: 62 },
    { status: "CANCELLED", line: "LINE-3", target: 5, done: 0 },
  ];
  const notes = ["VPI", "RR", "MC", "1. SET VPI", "VPI", "MC", "VPI", "RR", "VPI", "-"];

  let logCount = 0;
  for (let i = 0; i < woPlan.length; i++) {
    const p = woPlan[i]!;
    const wo = await prisma.workOrder.create({
      data: {
        tenantId, number: `WO-DEMO-${String(i + 1).padStart(3, "0")}`,
        customerId: custId(i), customerName: custName(i),
        coilType: COIL_TYPES[i % COIL_TYPES.length], line: p.line,
        targetCoils: p.target, completedCoils: p.done, status: p.status,
        startDate: p.status === "PLANNED" ? null : hoursAgo(48 - i),
        endDate: p.status === "COMPLETED" ? hoursAgo(2) : null,
        notes: notes[i], createdById,
      },
      select: { id: true },
    });

    if (p.done > 0) {
      // Üretilen bobinleri kilometre taşı istasyonlarına ve operatörlere dağıt.
      const lineOps = operators.filter((o) => o.line === p.line);
      const useOps = lineOps.length ? lineOps : operators;
      const milestones = ["LO", "PRO", "SPR", "TEST"];
      let remaining = p.done;
      for (let s = 0; s < milestones.length && remaining > 0; s++) {
        const code = milestones[s]!;
        const qty = s === milestones.length - 1 ? remaining : Math.ceil(p.done / milestones.length);
        const produced = Math.min(qty, remaining);
        remaining -= produced;
        const op = useOps[s % useOps.length]!;
        const isOpenToday = p.status === "IN_PROGRESS" && s === 0; // ilk istasyon oturumu bugün açık
        const checkIn = isOpenToday ? minsAgo(35 + s * 10) : hoursAgo(24 - s * 2);
        await prisma.productionLog.create({
          data: {
            tenantId, workOrderId: wo.id, stationId: stationByCode[code]!, operatorId: op.id,
            scannedBarcode: `WO-DEMO-${String(i + 1).padStart(3, "0")}`,
            producedQty: produced, scrapQty: s === 1 ? Math.max(0, Math.round(produced * 0.05)) : 0,
            status: isOpenToday ? "ACTIVE" : "DONE",
            checkInAt: checkIn,
            checkOutAt: isOpenToday ? null : new Date(checkIn.getTime() + 90 * 60000),
            elapsedMinutes: isOpenToday ? null : 90,
          },
        });
        logCount++;
      }
    }
  }
  console.log(`  İş emri: ${woPlan.length} · Üretim kaydı: ${logCount}`);
  console.log("\n✔ Üretim demo verisi tamamlandı.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
