// Prisma datasource provider'ını değiştirir (dev: sqlite, prod/Vercel: postgresql).
// Kullanım: node scripts/set-db-provider.mjs <sqlite|postgresql>
// Not: Yalnız `datasource db { provider = "..." }` satırını değiştirir; idempotenttir.
// Vercel build'inde `postgresql`'e çevrilir (bkz. package.json → vercel-build).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const target = process.argv[2];
if (!["sqlite", "postgresql"].includes(target)) {
  console.error('Kullanım: node scripts/set-db-provider.mjs <sqlite|postgresql>');
  process.exit(1);
}

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "schema.prisma");
const src = readFileSync(schemaPath, "utf8");
const next = src.replace(/(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"(sqlite|postgresql)"/, `$1"${target}"`);

if (next === src) {
  console.log(`Prisma provider zaten "${target}" (değişiklik yok).`);
} else {
  writeFileSync(schemaPath, next);
  console.log(`Prisma datasource provider -> "${target}"`);
}
