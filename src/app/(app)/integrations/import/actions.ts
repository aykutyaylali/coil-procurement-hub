"use server";
import { revalidatePath } from "next/cache";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { getStorage, generateStorageKey } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { d } from "@/lib/money";
import { ok, fail, type Result, AppError, NotFoundError } from "@/lib/errors";
import { parseKalemRows, buildSummary, KALEM_SHEET, type ImportSummary } from "@/domain/import/historical";
import { readSheetRows, listSheets, dryRun, commitImport, rollbackImport, type DryRunResult } from "@/domain/import/commit";

export interface AnalyzeResult {
  fileKey: string;
  fileName: string;
  sheets: string[];
  summary: ImportSummary;
  dry: DryRunResult;
  errorSample: { row: number; order: string; error: string }[];
  warningCounts: Record<string, number>;
}

/** Dosya yükle + analiz + dry-run (yazma yok). */
export async function analyzeImport(formData: FormData): Promise<Result<AnalyzeResult>> {
  try {
    const user = await requirePermission(PERMISSIONS.ADMIN_INTEGRATIONS);
    const file = formData.get("file") as File | null;
    const sheetName = String(formData.get("sheet") ?? KALEM_SHEET) || KALEM_SHEET;
    if (!file) throw new AppError("Dosya seçilmedi.");
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new AppError("Yalnızca .xlsx dosyası kabul edilir.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const sheets = await listSheets(buffer);
    const rows = await readSheetRows(buffer, sheetName);
    const parsed = parseKalemRows(rows);
    const summary = buildSummary(parsed);
    const dry = await dryRun(user.tenantId, parsed);

    // Kaynak dosyayı depola (gerçek import için tekrar okunur)
    const storage = getStorage();
    const fileKey = generateStorageKey(user.tenantId, file.name);
    await storage.put(fileKey, buffer, file.type);

    const errorSample = parsed
      .filter((l) => l.errors.length)
      .slice(0, 100)
      .map((l) => ({ row: l.sourceRowNo, order: l.orderNumber, error: l.errors.join("; ") }));

    const warningCounts: Record<string, number> = {};
    for (const l of parsed) for (const w of l.warnings) {
      const key = w.replace(/".*?"/g, "").replace(/\(.*?\)/g, "").trim();
      warningCounts[key] = (warningCounts[key] || 0) + 1;
    }

    return ok({ fileKey, fileName: file.name, sheets, summary, dry, errorSample, warningCounts });
  } catch (e) {
    return fail(e);
  }
}

async function backupSqlite(): Promise<string | null> {
  // Geliştirmede SQLite yedeği (üretim PostgreSQL yedeği docs/backup-restore.md)
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.startsWith("file:")) return null;
  try {
    const dbPath = path.resolve(process.cwd(), "prisma", dbUrl.replace("file:", "").replace("./", ""));
    const backupsDir = path.resolve(process.cwd(), "prisma", "backups");
    await fs.mkdir(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(backupsDir, `dev-${stamp}.db`);
    await fs.copyFile(dbPath, dest);
    return dest;
  } catch {
    return null;
  }
}

/** Gerçek içe aktarma: yedek al -> transaction -> ImportBatch(COMMITTED) -> mutabakat. */
export async function runImport(input: { fileKey: string; fileName: string; sheet?: string }): Promise<Result<{ batchId: string; result: Awaited<ReturnType<typeof commitImport>>; reconcile: { sourceTry: string; importedTry: string; diff: string; ok: boolean } }>> {
  try {
    const user = await requirePermission(PERMISSIONS.ADMIN_INTEGRATIONS);
    const sheetName = input.sheet || KALEM_SHEET;

    const storage = getStorage();
    const buffer = await storage.get(input.fileKey);
    const rows = await readSheetRows(buffer, sheetName);
    const parsed = parseKalemRows(rows);
    const summary = buildSummary(parsed);

    const company = await prisma.company.findFirst({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "asc" } });
    if (!company) throw new AppError("Şirket bulunamadı. Önce şirket tanımlayın.");

    await backupSqlite();

    // Batch oluştur (COMMITTED sonrası güncellenir)
    const batch = await prisma.importBatch.create({
      data: {
        tenantId: user.tenantId, fileName: input.fileName, sheetName, status: "DRY_RUN",
        totalRows: summary.totalRows, fileKey: input.fileKey, createdById: user.id,
        stats: JSON.stringify({ sourceTotalTry: summary.sourceTotalTry, totalOrders: summary.totalOrders }),
      },
    });

    const result = await prisma.$transaction(
      async (tx) => {
        return commitImport(tx, { tenantId: user.tenantId, userId: user.id, companyId: company.id, batchId: batch.id, parsed });
      },
      { timeout: 120_000, maxWait: 30_000 },
    );

    // Mutabakat: kaynak TL vs içe aktarılan TL (mükerrer atlananlar hariç)
    const diff = d(summary.sourceTotalTry).minus(result.importedTotalTry);
    const reconcileOk = diff.abs().lessThanOrEqualTo("0.01") || result.skippedOrders > 0;

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMMITTED", committedAt: new Date(),
        ordersCreated: result.ordersCreated, linesCreated: result.linesCreated,
        suppliersCreated: result.suppliersCreated, categoriesCreated: result.categoriesCreated,
        stats: JSON.stringify({ ...summary, importedTotalTry: result.importedTotalTry, skippedOrders: result.skippedOrders, reconcileDiff: diff.toFixed(2) }),
      },
    });

    await writeAudit({
      tenantId: user.tenantId, userId: user.id, action: "IMPORT",
      entityType: "ImportBatch", entityId: batch.id,
      after: { fileName: input.fileName, ...result },
    });

    revalidatePath("/integrations/import");
    revalidatePath("/orders");
    revalidatePath("/dashboard");
    revalidatePath("/reports");

    return ok({
      batchId: batch.id,
      result,
      reconcile: { sourceTry: summary.sourceTotalTry, importedTry: result.importedTotalTry, diff: diff.toFixed(2), ok: reconcileOk },
    });
  } catch (e) {
    return fail(e);
  }
}

/** Batch geri alma (kontrollü). */
export async function rollbackBatch(batchId: string): Promise<Result<{ ordersDeleted: number; suppliersDeleted: number; categoriesDeleted: number }>> {
  try {
    const user = await requirePermission(PERMISSIONS.ADMIN_INTEGRATIONS);
    const batch = await prisma.importBatch.findFirst({ where: { id: batchId, tenantId: user.tenantId } });
    if (!batch) throw new NotFoundError("Import batch bulunamadı.");
    if (batch.status !== "COMMITTED") throw new AppError("Yalnızca tamamlanmış batch geri alınabilir.");

    const res = await prisma.$transaction(async (tx) => rollbackImport(tx, { tenantId: user.tenantId, userId: user.id, batchId }), { timeout: 120_000 });
    revalidatePath("/integrations/import");
    revalidatePath("/orders");
    revalidatePath("/dashboard");
    return ok(res);
  } catch (e) {
    return fail(e);
  }
}
