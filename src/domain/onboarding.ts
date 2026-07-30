import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";

/**
 * Tedarikçi self-servis onboarding. Tedarikçinin platformda hesabı yoktur;
 * kendisine gönderilen güvenli, süreli token bağlantısıyla (hash'i saklanır)
 * şirket/vergi/iletişim/banka bilgilerini doldurur. Gönderim sonrası tedarikçi
 * PENDING_APPROVAL olur ve token tek kullanımlıktır (iptal edilir).
 */

export interface OnboardingContext {
  supplierId: string;
  code: string;
  legalName: string;
  supplierType: string;
  country: string;
  taxOffice: string | null;
  taxNumber: string | null;
  addressLine: string | null;
  city: string | null;
  website: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  bankName: string;
  iban: string;
  swiftBic: string;
  accountHolder: string;
}

async function findByToken(token: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { onboardingToken: hashToken(token) },
    include: {
      contacts: { where: { isPrimary: true }, take: 1 },
      bankAccounts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!supplier) throw new AppError("Geçersiz veya kullanılmış bağlantı.", "INVALID_TOKEN", 404);
  if (supplier.onboardingTokenExpiresAt && supplier.onboardingTokenExpiresAt.getTime() < Date.now()) {
    throw new AppError("Bu onboarding bağlantısının süresi dolmuş. Lütfen yeni bağlantı isteyin.", "TOKEN_EXPIRED", 410);
  }
  return supplier;
}

/** Token bağlamını (ön-dolgulu form için) yükler. */
export async function loadOnboardingContext(token: string): Promise<OnboardingContext> {
  const s = await findByToken(token);
  const c = s.contacts[0];
  const b = s.bankAccounts[0];
  return {
    supplierId: s.id,
    code: s.code,
    legalName: s.legalName,
    supplierType: s.supplierType,
    country: s.country,
    taxOffice: s.taxOffice,
    taxNumber: s.taxNumber,
    addressLine: s.addressLine,
    city: s.city,
    website: s.website,
    contactName: c?.name ?? "",
    contactEmail: c?.email ?? "",
    contactPhone: c?.phone ?? "",
    bankName: b?.bankName ?? "",
    iban: b?.iban ?? "",
    swiftBic: b?.swiftBic ?? "",
    accountHolder: b?.accountHolder ?? s.legalName,
  };
}

export const onboardingSchema = z.object({
  legalName: z.string().min(2, "Yasal ünvan zorunludur."),
  taxOffice: z.string().optional(),
  taxNumber: z.string().min(2, "Vergi/kimlik numarası zorunludur."),
  country: z.string().min(2).default("TR"),
  addressLine: z.string().optional(),
  city: z.string().optional(),
  website: z.string().optional(),
  contactName: z.string().min(2, "İletişim kişisi adı zorunludur."),
  contactEmail: z.string().email("Geçerli bir e-posta girin."),
  contactPhone: z.string().optional(),
  bankName: z.string().min(2, "Banka adı zorunludur."),
  iban: z.string().min(10, "Geçerli bir IBAN girin."),
  swiftBic: z.string().optional(),
  accountHolder: z.string().optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/**
 * Onboarding formunu kaydeder. Token doğrulanır, tedarikçi bilgileri güncellenir,
 * birincil iletişim ve banka hesabı (çift-onay için PENDING) oluşturulur/güncellenir,
 * durum PENDING_APPROVAL olur ve token iptal edilir (tek kullanımlık).
 */
export async function submitOnboarding(token: string, input: OnboardingInput): Promise<{ supplierId: string }> {
  const supplier = await findByToken(token);
  const data = onboardingSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    await tx.supplier.update({
      where: { id: supplier.id },
      data: {
        legalName: data.legalName,
        taxOffice: data.taxOffice || null,
        taxNumber: data.taxNumber,
        country: data.country,
        addressLine: data.addressLine || null,
        city: data.city || null,
        website: data.website || null,
        status: "PENDING_APPROVAL",
        onboardingToken: null,
        onboardingTokenExpiresAt: null,
      },
    });

    // Birincil iletişim: varsa güncelle, yoksa oluştur
    const existingContact = await tx.supplierContact.findFirst({ where: { supplierId: supplier.id, isPrimary: true } });
    if (existingContact) {
      await tx.supplierContact.update({
        where: { id: existingContact.id },
        data: { name: data.contactName, email: data.contactEmail || null, phone: data.contactPhone || null },
      });
    } else {
      await tx.supplierContact.create({
        data: { supplierId: supplier.id, name: data.contactName, email: data.contactEmail || null, phone: data.contactPhone || null, isPrimary: true },
      });
    }

    // Banka hesabı: çift-onay gerektirir → PENDING olarak eklenir
    await tx.supplierBankAccount.create({
      data: {
        supplierId: supplier.id,
        bankName: data.bankName,
        iban: data.iban,
        swiftBic: data.swiftBic || null,
        accountHolder: data.accountHolder || data.legalName,
        status: "PENDING",
      },
    });

    await writeAudit(
      {
        tenantId: supplier.tenantId,
        userId: null,
        action: "UPDATE",
        entityType: "Supplier",
        entityId: supplier.id,
        after: { onboarding: "SUBMITTED", status: "PENDING_APPROVAL" },
        reason: "Tedarikçi self-servis onboarding gönderimi",
      },
      tx,
    );
  });

  return { supplierId: supplier.id };
}
