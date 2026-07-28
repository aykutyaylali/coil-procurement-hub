"use client";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(auth)/actions";
import { updateLocale } from "@/app/(app)/profile/actions";

export function Topbar({
  userName,
  userTitle,
  pendingApprovals,
  unreadNotifications,
  locale,
}: {
  userName: string;
  userTitle: string;
  pendingApprovals: number;
  unreadNotifications: number;
  locale: string;
}) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur">
      <form
        className="relative flex-1 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q") as string;
          if (q?.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Icons.Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          placeholder="Talep, RFQ, sipariş, tedarikçi ara..."
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </form>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => router.push("/approvals")} title="Bekleyen Onaylar" className="relative">
          <Icons.Stamp className="size-4" />
          {pendingApprovals > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-warning-foreground">
              {pendingApprovals}
            </span>
          )}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => router.push("/notifications")} title="Bildirimler" className="relative">
          <Icons.Bell className="size-4" />
          {unreadNotifications > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadNotifications}
            </span>
          )}
        </Button>
        <div className="flex overflow-hidden rounded-md border text-xs" title="Dil / Language">
          <button
            onClick={() => updateLocale("tr")}
            className={`px-2 py-1 ${locale === "tr" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            TR
          </button>
          <button
            onClick={() => updateLocale("en")}
            className={`px-2 py-1 ${locale === "en" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            EN
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Tema Değiştir"
        >
          <Icons.Sun className="size-4 dark:hidden" />
          <Icons.Moon className="hidden size-4 dark:block" />
        </Button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {userName.charAt(0)}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium leading-tight">{userName}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">{userTitle}</div>
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 rounded-md border bg-popover p-1 shadow-lg">
              <button
                onClick={() => router.push("/profile")}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-accent"
              >
                <Icons.User className="size-4" /> Profil
              </button>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-destructive hover:bg-accent"
                >
                  <Icons.LogOut className="size-4" /> Çıkış Yap
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
