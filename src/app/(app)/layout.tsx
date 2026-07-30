import { redirect } from "next/navigation";
import { getCurrentUser, userCan, isSupplierUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { getMyPendingApprovals } from "@/lib/pending";
import { NAV_ITEMS } from "@/components/shell/nav-config";
import { Sidebar, MobileMenu } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { ROLE_LABELS_TR, type RoleKey } from "@/lib/rbac";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/ui/toast";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Tedarikçi portal kullanıcıları iç uygulamaya erişemez → kendi portallarına
  if (isSupplierUser(user)) redirect("/portal/orders");

  const visibleNav = NAV_ITEMS.filter((item) => !item.permission || userCan(user, item.permission));

  const [pending, unread] = await Promise.all([
    getMyPendingApprovals(),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);

  const roleLabel =
    user.title ||
    (user.roleKeys[0] ? ROLE_LABELS_TR[user.roleKeys[0] as RoleKey] : "") ||
    "Kullanıcı";

  const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;

  return (
    <I18nProvider locale={locale}>
      <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar items={visibleNav} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            userName={user.name}
            userTitle={roleLabel}
            pendingApprovals={pending.length}
            unreadNotifications={unread}
            locale={locale}
            mobileMenu={<MobileMenu items={visibleNav} />}
          />
          <main className="flex-1 overflow-x-hidden p-6">{children}</main>
        </div>
      </div>
      </ToastProvider>
    </I18nProvider>
  );
}
