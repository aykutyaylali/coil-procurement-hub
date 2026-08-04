"use client";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  mobileMenu,
}: {
  userName: string;
  userTitle: string;
  pendingApprovals: number;
  unreadNotifications: number;
  locale: string;
  mobileMenu?: React.ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Menü dışına tıklama / Esc ile kapanır (macOS tarzı davranış).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const initials = userName.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const isDark = theme === "dark";
  const segBtn = (active: boolean) => `flex-1 px-2.5 py-1 transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`;

  return (
    <header className="sticky top-0 z-20 flex h-14 min-w-0 items-center gap-2 border-b border-border/60 bg-card/70 px-3 backdrop-blur-md sm:gap-3 sm:px-4">
      {mobileMenu}
      <form
        className="relative hidden max-w-md flex-1 md:block"
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
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
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

        {/* Kullanıcı menüsü — yalnız avatar; ad/rol/tema/dil/çıkış menüde toplanır. */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Kullanıcı menüsü"
            aria-expanded={menuOpen}
            className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary ring-2 ring-transparent transition hover:ring-primary/20"
          >
            {initials}
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-border/60 bg-popover p-1.5 shadow-lg">
              {/* Kimlik başlığı */}
              <div className="flex items-center gap-3 px-2.5 py-2">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-semibold text-primary">{initials}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{userName}</div>
                  <div className="truncate text-xs text-muted-foreground">{userTitle}</div>
                </div>
              </div>
              <div className="my-1 h-px bg-border/70" />

              <button onClick={() => { setMenuOpen(false); router.push("/profile"); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-accent">
                <Icons.User className="size-4 text-muted-foreground" /> Profil
              </button>

              {/* Tema */}
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-sm">
                <span className="flex items-center gap-2.5"><Icons.SunMoon className="size-4 text-muted-foreground" /> Tema</span>
                <div className="flex overflow-hidden rounded-lg border text-xs">
                  <button onClick={() => setTheme("light")} className={segBtn(!isDark)}>Açık</button>
                  <button onClick={() => setTheme("dark")} className={segBtn(isDark)}>Koyu</button>
                </div>
              </div>

              {/* Dil */}
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-sm">
                <span className="flex items-center gap-2.5"><Icons.Languages className="size-4 text-muted-foreground" /> Dil</span>
                <div className="flex overflow-hidden rounded-lg border text-xs">
                  <button onClick={() => updateLocale("tr")} className={segBtn(locale === "tr")}>TR</button>
                  <button onClick={() => updateLocale("en")} className={segBtn(locale === "en")}>EN</button>
                </div>
              </div>

              <div className="my-1 h-px bg-border/70" />
              <form action={logoutAction}>
                <button type="submit" className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-destructive hover:bg-destructive/10">
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
