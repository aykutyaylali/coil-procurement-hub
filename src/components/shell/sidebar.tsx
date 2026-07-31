"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, type NavItem } from "./nav-config";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : <Icons.Circle className={className} />;
}

/** Navigasyon içeriği (grup + birincil/ileri) — hem masaüstü sidebar hem mobil drawer kullanır. */
export function SidebarNav({ items, collapsed = false, onNavigate }: { items: NavItem[]; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});

  const groups = Array.from(new Set(items.map((i) => i.group)));
  const groupLabel = (g: NavItem["group"]) => (g === "main" ? "" : t(`group.${g}` as TranslationKey));

  const renderLink = (item: NavItem) => {
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        title={t(item.labelKey as TranslationKey)}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-accent hover:text-foreground",
        )}
      >
        <Icon name={item.icon} className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">{t(item.labelKey as TranslationKey)}</span>}
      </Link>
    );
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      {groups.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        const primary = groupItems.filter((i) => !i.secondary);
        const secondary = groupItems.filter((i) => i.secondary);
        const open = showAdvanced[group];
        return (
          <div key={group} className="mb-3">
            {!collapsed && groupLabel(group) && (
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {groupLabel(group)}
              </div>
            )}
            {primary.map(renderLink)}
            {secondary.length > 0 && !collapsed && (
              <>
                <button
                  onClick={() => setShowAdvanced((s) => ({ ...s, [group]: !s[group] }))}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                  aria-expanded={open}
                >
                  <Icon name={open ? "ChevronDown" : "ChevronRight"} className="size-3" />
                  İleri
                </button>
                {open && secondary.map(renderLink)}
              </>
            )}
            {secondary.length > 0 && collapsed && secondary.map(renderLink)}
          </div>
        );
      })}
    </nav>
  );
}

/** Masaüstü sidebar (lg+). */
export function Sidebar({ items }: { items: NavItem[] }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={cn("sticky top-0 hidden h-screen flex-col border-r bg-card transition-all duration-200 lg:flex", collapsed ? "w-16" : "w-64")}>
      <div className="flex h-14 items-center justify-center border-b px-2">
        <Link href="/dashboard" title="Coil Partners" className="flex items-center justify-center">
          {collapsed ? (
            // Daraltılmış: yazı kesilmesin diye yalnız AMBLEM (logonun sol karesi) gösterilir.
            <span className="flex size-9 items-center justify-start overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5">
              <Image src="/brand/coil-logo.png" alt="Coil" width={281} height={120} priority className="h-9 w-auto max-w-none" />
            </span>
          ) : (
            <span className="flex items-center rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-black/5">
              <Image src="/brand/coil-logo.png" alt="Coil Partners" width={281} height={120} priority className="h-7 w-auto" />
            </span>
          )}
        </Link>
      </div>
      <SidebarNav items={items} collapsed={collapsed} />
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-10 items-center justify-center border-t text-muted-foreground hover:bg-accent"
        aria-label="Menüyü daralt/genişlet"
      >
        <Icon name={collapsed ? "ChevronRight" : "ChevronLeft"} className="size-4" />
      </button>
    </aside>
  );
}

/** Mobil hamburger + drawer (lg altı). Erişilebilir: aria, Esc/overlay ile kapanır, gezinince kapanır. */
export function MobileMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Menüyü aç"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-md border hover:bg-accent"
      >
        <Icons.Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Ana menü">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col border-r bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-3">
              <Image src="/brand/coil-logo.png" alt="Coil Partners" width={281} height={120} className="h-7 w-auto" />
              <button onClick={() => setOpen(false)} aria-label="Menüyü kapat" className="rounded-md p-1 hover:bg-accent">
                <Icons.X className="size-5" />
              </button>
            </div>
            <SidebarNav items={items} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
