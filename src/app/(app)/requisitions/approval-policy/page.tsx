import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { ApprovalPolicyForm, type CompanyPolicy } from "./policy-form";
import { parseReqApprovalPolicy } from "@/domain/approval-policy";

export const metadata: Metadata = { title: "Talep Onay Politikası" };

export default async function ApprovalPolicyPage() {
  const user = await requirePermission(PERMISSIONS.REQUISITION_ASSIGN);
  const companies = await prisma.company.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, name: true, baseCurrency: true, settings: true },
    orderBy: { name: "asc" },
  });

  const policies: CompanyPolicy[] = companies.map((c) => {
    const p = parseReqApprovalPolicy(c.settings);
    return { companyId: c.id, companyName: c.name, currency: c.baseCurrency, mode: p.mode, threshold: p.threshold };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Talep Onay Politikası"
        description="Hangi taleplerin onaya gideceğini satınalma belirler. Eşik altındaki talepler onay beklemeden doğrudan onaylanır ve RFQ'ya çevrilebilir."
      />
      <ApprovalPolicyForm companies={policies} />
    </div>
  );
}
