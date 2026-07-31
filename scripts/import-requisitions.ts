import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";

const EXCEL = "C:\\Users\\Aykut\\Downloads\\Satinalma_Dashboard_Raporu_1.xlsx";
const BATCH = "reqimport-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "");

function translit(s: string): string {
  const map: Record<string, string> = { ş: "s", Ş: "s", ğ: "g", Ğ: "g", ı: "i", İ: "i", ç: "c", Ç: "c", ö: "o", Ö: "o", ü: "u", Ü: "u" };
  return s.replace(/[şŞğĞıİçÇöÖüÜ]/g, (c) => map[c] ?? c);
}
function slug(name: string): string {
  return translit(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
}
function titleCase(s: string): string {
  return s.toLocaleLowerCase("tr-TR").split(/\s+/).map((w) => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1)).join(" ");
}
function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v; // exceljs ham Date
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
/** exceljs hücre değerini düz değere indirger (tarih→Date, formül→sonuç, richText→metin). */
function cellToRaw(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    if ("result" in o) return o.result === undefined ? null : o.result;
    if ("text" in o) return o.text;
    return null;
  }
  return v;
}
/** "Kalem Detayları" sayfasını satır nesnelerine çevirir (defval:null). */
async function readKalemRows(path: string): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(path) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Kalem Detayları");
  if (!ws) throw new Error("'Kalem Detayları' sayfası bulunamadı.");
  const headers: (string | null)[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const h = cellToRaw(cell.value);
    headers[col] = h === null ? null : String(h);
  });
  const out: Record<string, unknown>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    const obj: Record<string, unknown> = {};
    for (let col = 1; col < headers.length; col++) {
      const key = headers[col];
      if (key == null || key === "") continue;
      obj[key] = cellToRaw(row.getCell(col).value);
    }
    out.push(obj);
  }
  return out;
}

async function main() {
  const rows = await readKalemRows(EXCEL);

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error("tenant yok");
  const company = await prisma.company.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
  if (!company) throw new Error("company yok");
  const categories = await prisma.category.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
  const catByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));

  // 1) Benzersiz talep açanlar (case-insensitive dedup; ilk görülen görünen ad)
  const requesterDisplay = new Map<string, string>(); // key(lower) -> display
  for (const r of rows) {
    const re = r["Talep Eden"] ? String(r["Talep Eden"]).trim() : null;
    if (re && !requesterDisplay.has(re.toLowerCase())) requesterDisplay.set(re.toLowerCase(), re);
  }

  // 2) Kullanıcıları oluştur (giriş yapamaz: passwordHash null, isImported)
  const userIdByKey = new Map<string, string>();
  const usedEmails = new Set<string>();
  let usersCreated = 0, usersExisting = 0;
  for (const [key, display] of requesterDisplay) {
    let base = slug(display) || "talep.sahibi";
    let email = `${base}@imported.coilpartners.com`;
    let i = 2;
    while (usedEmails.has(email)) { email = `${base}.${i++}@imported.coilpartners.com`; }
    usedEmails.add(email);
    const existing = await prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
    if (existing) {
      userIdByKey.set(key, existing.id); usersExisting++;
    } else {
      const u = await prisma.user.create({
        data: { tenantId: tenant.id, email, name: titleCase(display), title: "İçe aktarılan talep sahibi", locale: "tr", isActive: true, isImported: true, importBatchId: BATCH, passwordHash: null },
      });
      userIdByKey.set(key, u.id); usersCreated++;
    }
  }

  // 3) Talepleri (Talep No) grupla
  const byTalep = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const tn = r["Talep No"] ? String(r["Talep No"]).trim() : null;
    if (!tn) continue;
    if (!byTalep.has(tn)) byTalep.set(tn, []);
    byTalep.get(tn)!.push(r);
  }

  let reqCreated = 0, reqExisting = 0, linesCreated = 0;
  for (const [talepNo, items] of byTalep) {
    const exists = await prisma.purchaseRequisition.findFirst({ where: { tenantId: tenant.id, number: talepNo } });
    if (exists) { reqExisting++; continue; }
    const first = items[0]!;
    const reqKey = String(first["Talep Eden"]).trim().toLowerCase();
    const requesterId = userIdByKey.get(reqKey)!;
    const orderDate = parseDate(first["Tarih"]) ?? new Date();
    // estimatedTotal = TL kalem tutarları toplamı (boşlar 0 katkı)
    let estTotal = 0;
    const lineData = items.map((it, idx) => {
      const qty = num(it["Miktar"]);
      const price = num(it["Birim Fiyat"]); // boşsa null (0 uydurulmaz)
      const tl = num(it["Kalem Tutarı (TL)"]);
      if (tl != null) estTotal += tl;
      const kdv = it["KDV"] ? String(it["KDV"]).replace("%", "").trim() : null;
      const catId = it["Kategori"] ? catByName.get(String(it["Kategori"]).trim().toLowerCase()) ?? null : null;
      return {
        lineNo: idx + 1,
        description: it["Ürün / Açıklama"] ? String(it["Ürün / Açıklama"]).trim() : "(açıklama yok)",
        quantity: qty != null ? String(qty) : "0",
        uom: it["Birim"] ? String(it["Birim"]).trim() : null,
        estUnitPrice: price != null ? String(price) : "0", // tahmini; boşsa 0 (estUnitPrice non-nullable)
        currency: it["PB"] ? String(it["PB"]).trim() : "TL",
        categoryId: catId,
      };
    });
    await prisma.purchaseRequisition.create({
      data: {
        tenantId: tenant.id, number: talepNo, companyId: company.id, requesterId,
        status: "ORDERED", priority: "NORMAL", purchaseType: "GOODS", operationType: "DOMESTIC_PURCHASE",
        currency: "TRY", estimatedTotal: String(estTotal), createdAt: orderDate,
        isImported: true, importBatchId: BATCH,
        lines: { create: lineData },
      },
    });
    reqCreated++; linesCreated += lineData.length;
  }

  // 4) Mutabakat
  const totalLines = rows.filter((r) => r["Talep No"]).length;
  console.log("=== IMPORT MUTABAKAT ===");
  console.log("Batch:", BATCH);
  console.log(`Talep açanlar (Excel benzersiz): ${requesterDisplay.size} | kullanıcı oluşturuldu: ${usersCreated} | mevcut: ${usersExisting}`);
  console.log(`Talepler (Excel benzersiz): ${byTalep.size} | oluşturuldu: ${reqCreated} | zaten vardı: ${reqExisting}`);
  console.log(`Kalem satırı (Excel, Talep No dolu): ${totalLines} | oluşturulan talep kalemi: ${linesCreated}`);
  console.log(`MUTABIK: talep ${byTalep.size === reqCreated + reqExisting} | kullanıcı ${requesterDisplay.size === usersCreated + usersExisting}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("HATA:", e); await prisma.$disconnect(); process.exit(1); });
