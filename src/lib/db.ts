import { PrismaClient } from "@prisma/client";

// Prisma Client singleton (Next.js dev sırasında hot-reload'da bağlantı sızıntısını önler)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
