/**
 * ============================================================================
 * SQLite (prisma/dev.db)  ->  PostgreSQL (Neon)  VERİ AKTARIM (ETL) SCRIPT'İ
 * ============================================================================
 *
 * Gerçek geliştirme verisini (tenant, kullanıcı, tedarikçi, RFQ, sipariş, teslimat,
 * fatura ve TÜM bağımlı tablolar) SQLite'tan okuyup Postgres'e Prisma client üzerinden
 * yazar. Şema DEĞİŞMEZ; yalnız veri taşınır. Idempotenttir (skipDuplicates) — tekrar
 * çalıştırılırsa mevcut kayıtları çoğaltmaz.
 *
 * Tasarım:
 *  - KAYNAK (SQLite): `node:sqlite` (Node 22+ yerleşik, sıfır bağımlılık) ile READ-ONLY
 *    ham SQL okuma. Prisma SQLite depolama biçimi ham okunur ve şu şekilde map edilir:
 *      • Boolean  : 0/1 (integer)        -> true/false
 *      • DateTime : unix epoch ms (integer) -> JS Date
 *      • Decimal/JSON : String olarak saklanır -> aynen aktarılır (kayıpsız)
 *      • Int/Float/String : doğrudan
 *  - HEDEF (Postgres): `@prisma/client` (postgresql provider ile generate edilmiş).
 *  - Tablo/sütun adları = model/alan adları (şemada @map yok).
 *  - Foreign key sırası: DMMF ilişkilerinden topolojik sıralama (zorunlu FK'ler önce).
 *  - Self-referanslar (User.managerId, Category.parentId, Comment.parentId) ve tüm
 *    NULLABLE FK sütunları önce NULL yazılır, ardından 2. geçişte güncellenir →
 *    hiçbir aşamada FK ihlali olmaz.
 *
 * ÇALIŞTIRMA (autonom deploy akışıyla uyumlu — bkz. DEPLOY.md):
 *   1) node scripts/set-db-provider.mjs postgresql
 *   2) DATABASE_URL="<neon-direct-url>" npx prisma migrate deploy   # şemayı kur
 *   3) SQLITE_PATH="prisma/dev.db" DATABASE_URL="<neon-direct-url>" npx prisma generate
 *   4) SQLITE_PATH="prisma/dev.db" DATABASE_URL="<neon-direct-url>" npx tsx scripts/migrate-data.ts
 *   5) node scripts/set-db-provider.mjs sqlite && npx prisma generate   # dev'e geri dön
 *
 * ENV:
 *   DATABASE_URL  (zorunlu)  Postgres bağlantısı. Migration/aktarım için DIRECT (pooler'sız) önerilir.
 *   SQLITE_PATH   (ops.)     Kaynak dosya; varsayılan "prisma/dev.db".
 *   BATCH_SIZE    (ops.)     Insert parça boyutu; varsayılan 500.
 *   DRY_RUN=true  (ops.)     Yazma yapmaz; yalnız okur ve plan/sayıları raporlar.
 * ============================================================================
 */
import { DatabaseSync } from "node:sqlite";
import { PrismaClient, Prisma } from "@prisma/client";

const SQLITE_PATH = process.env.SQLITE_PATH ?? "prisma/dev.db";
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 500);
const DRY_RUN = process.env.DRY_RUN === "true";

type ScalarField = { name: string; type: string; isRequired: boolean };
type ModelMeta = {
  name: string;
  delegate: string; // prisma[delegate]
  idField: string;
  scalars: ScalarField[];
  requiredDeps: string[]; // FK sütunları zorunlu olan diğer modeller (topo için)
  deferCols: Set<string>; // insert'te NULL, 2. geçişte set edilecek FK sütunları
};

/** Prisma delegate adı: modelin ilk harfi küçük, gerisi aynı (RFQ->rFQ, User->user). */
const toDelegate = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/** DMMF'ten model metadata'sı + zorunlu FK bağımlılıkları + ertelenecek FK sütunları. */
function buildMeta(): ModelMeta[] {
  return Prisma.dmmf.datamodel.models.map((m) => {
    const scalars: ScalarField[] = m.fields
      .filter((f) => f.kind === "scalar")
      .map((f) => ({ name: f.name, type: f.type, isRequired: f.isRequired }));
    const idField = m.fields.find((f) => f.isId)?.name ?? "id";
    const scalarByName = new Map(scalars.map((s) => [s.name, s]));

    const requiredDeps = new Set<string>();
    const deferCols = new Set<string>();

    for (const f of m.fields) {
      // İlişki (object) alanı ve yerel FK sütun(lar)ı olanlar
      const fromFields = (f as unknown as { relationFromFields?: string[] }).relationFromFields ?? [];
      if (f.kind !== "object" || fromFields.length === 0) continue;

      const isSelf = f.type === m.name;
      const allRequired = fromFields.every((c) => scalarByName.get(c)?.isRequired);

      if (isSelf || !allRequired) {
        // Self-referans ya da nullable FK -> ertele (NULL yaz, sonra güncelle)
        for (const c of fromFields) deferCols.add(c);
      } else {
        // Zorunlu, tabloya-çapraz FK -> topolojik bağımlılık
        requiredDeps.add(f.type);
      }
    }

    return {
      name: m.name,
      delegate: toDelegate(m.name),
      idField,
      scalars,
      requiredDeps: [...requiredDeps],
      deferCols,
    };
  });
}

/** Zorunlu FK'lere göre topolojik sıralama (Kahn). Döngü varsa hata verir. */
function topoSort(metas: ModelMeta[]): ModelMeta[] {
  const byName = new Map(metas.map((m) => [m.name, m]));
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep -> [ona bağımlı olanlar]

  for (const m of metas) {
    indeg.set(m.name, 0);
    dependents.set(m.name, []);
  }
  for (const m of metas) {
    const deps = m.requiredDeps.filter((d) => byName.has(d) && d !== m.name);
    indeg.set(m.name, deps.length);
    for (const d of deps) dependents.get(d)!.push(m.name);
  }

  const queue = metas.filter((m) => (indeg.get(m.name) ?? 0) === 0).map((m) => m.name);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const dep of dependents.get(n)!) {
      indeg.set(dep, (indeg.get(dep) ?? 0) - 1);
      if (indeg.get(dep) === 0) queue.push(dep);
    }
  }
  if (order.length !== metas.length) {
    const stuck = metas.filter((m) => !order.includes(m.name)).map((m) => m.name);
    throw new Error(`Zorunlu FK döngüsü tespit edildi, sıralanamadı: ${stuck.join(", ")}`);
  }
  return order.map((n) => byName.get(n)!);
}

/** Ham SQLite değerini Prisma/Postgres için doğru JS tipine çevirir. */
function coerce(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null;
  switch (type) {
    case "Boolean":
      if (typeof value === "boolean") return value;
      return typeof value === "bigint" ? value !== 0n : Number(value) !== 0;
    case "DateTime":
      if (value instanceof Date) return value;
      return new Date(typeof value === "bigint" ? Number(value) : (value as number | string));
    case "Int":
    case "BigInt":
    case "Float":
      return typeof value === "bigint" ? Number(value) : value;
    default: // String (decimal-as-string, JSON-as-string dahil) ve diğerleri
      return typeof value === "string" ? value : String(value);
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL tanımlı değil (Postgres hedefi).");

  console.log(`\n📦 SQLite -> Postgres ETL`);
  console.log(`   Kaynak : ${SQLITE_PATH}`);
  console.log(`   Hedef  : ${process.env.DATABASE_URL.replace(/:\/\/([^:]+):[^@]*@/, "://$1:****@")}`);
  console.log(`   Mod    : ${DRY_RUN ? "DRY_RUN (yazma yok)" : "AKTARIM"}\n`);

  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });
  const prisma = new PrismaClient();

  const metas = buildMeta();
  const order = topoSort(metas);

  // (id -> ertelenmiş FK sütun değerleri) — 2. geçişte güncellenecek
  const deferred: { delegate: string; idField: string; id: unknown; data: Record<string, unknown> }[] = [];
  const summary: { model: string; read: number; written: number }[] = [];
  let totalRead = 0;
  let totalWritten = 0;

  console.log(`➡️  Aktarım sırası (${order.length} tablo, FK-güvenli):`);
  console.log(`   ${order.map((m) => m.name).join(" → ")}\n`);

  try {
    for (const meta of order) {
      let rows: Record<string, unknown>[];
      try {
        rows = sqlite.prepare(`SELECT * FROM "${meta.name}"`).all() as Record<string, unknown>[];
      } catch {
        console.log(`   ⚠️  ${meta.name}: tablo SQLite'ta yok, atlanıyor.`);
        summary.push({ model: meta.name, read: 0, written: 0 });
        continue;
      }
      totalRead += rows.length;
      if (rows.length === 0) {
        summary.push({ model: meta.name, read: 0, written: 0 });
        continue;
      }

      const delegate = (prisma as unknown as Record<string, { createMany?: Function; update?: Function }>)[meta.delegate];
      if (!delegate?.createMany) {
        console.log(`   ⚠️  ${meta.name}: Prisma delegate bulunamadı (${meta.delegate}), atlanıyor.`);
        summary.push({ model: meta.name, read: rows.length, written: 0 });
        continue;
      }

      // Satırları map et; ertelenen FK sütunlarını NULL yap ve 2. geçiş için stash'le
      const records = rows.map((row) => {
        const rec: Record<string, unknown> = {};
        const deferData: Record<string, unknown> = {};
        for (const f of meta.scalars) {
          const v = coerce(row[f.name], f.type);
          if (meta.deferCols.has(f.name)) {
            if (v !== null) deferData[f.name] = v;
            rec[f.name] = null;
          } else {
            rec[f.name] = v;
          }
        }
        if (Object.keys(deferData).length > 0) {
          deferred.push({ delegate: meta.delegate, idField: meta.idField, id: rec[meta.idField], data: deferData });
        }
        return rec;
      });

      let written = 0;
      if (!DRY_RUN) {
        for (const part of chunk(records, BATCH_SIZE)) {
          const res = await (delegate.createMany as Function)({ data: part, skipDuplicates: true });
          written += (res as { count: number }).count;
        }
      }
      totalWritten += written;
      summary.push({ model: meta.name, read: rows.length, written });
      console.log(`   ✅ ${meta.name}: okundu ${rows.length}, yazıldı ${DRY_RUN ? "(dry)" : written}`);
    }

    // 2. GEÇİŞ: ertelenmiş self/nullable FK sütunlarını güncelle
    if (!DRY_RUN && deferred.length > 0) {
      console.log(`\n🔗 2. geçiş: ${deferred.length} kayıtta ertelenmiş FK sütunları güncelleniyor…`);
      let fixed = 0;
      for (const part of chunk(deferred, BATCH_SIZE)) {
        await prisma.$transaction(
          part.map((d) => {
            const del = (prisma as unknown as Record<string, { update: Function }>)[d.delegate]!;
            return del.update({ where: { [d.idField]: d.id }, data: d.data });
          }),
        );
        fixed += part.length;
      }
      console.log(`   ✅ ${fixed} kayıt güncellendi.`);
    } else if (deferred.length > 0) {
      console.log(`\n🔗 2. geçiş (dry): ${deferred.length} kayıtta FK güncellemesi planlandı.`);
    }

    // Özet
    console.log(`\n────────────── ÖZET ──────────────`);
    for (const s of summary.filter((x) => x.read > 0)) {
      console.log(`   ${s.model.padEnd(28)} okundu ${String(s.read).padStart(6)}  yazıldı ${DRY_RUN ? "  (dry)" : String(s.written).padStart(6)}`);
    }
    console.log(`──────────────────────────────────`);
    console.log(`   TOPLAM: okundu ${totalRead}, yazıldı ${DRY_RUN ? "(dry)" : totalWritten}, ertelenmiş FK ${deferred.length}`);
    console.log(`\n${DRY_RUN ? "🧪 DRY_RUN tamamlandı (yazma yapılmadı)." : "🎉 Aktarım tamamlandı."}\n`);
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\n❌ ETL hatası:", e);
  process.exit(1);
});
