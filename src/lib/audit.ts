import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/db";

export interface AuditInput {
  tenantId: string;
  userId?: string | null;
  action: string; // CREATE | UPDATE | STATUS_CHANGE | DELETE | LOGIN | APPROVE ...
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

/**
 * Değişmez (append-only) denetim kaydı yazar.
 * Not: AuditLog kayıtları hiçbir yerde UPDATE/DELETE edilmez.
 */
export async function writeAudit(input: AuditInput, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before !== undefined ? JSON.stringify(input.before) : null,
      after: input.after !== undefined ? JSON.stringify(input.after) : null,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      correlationId: input.correlationId ?? null,
    },
  });
}
