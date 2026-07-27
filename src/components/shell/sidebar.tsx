"use client";
import { useState } from "react";
import Link from "next/link";
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

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  const groups = Array.from(new Set(items.map((i) => i.group)));
  const groupLabel = (g: NavItem["group"]) =>
    g === "main" ? "" : t(`group.${g}` as TranslationKey);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col border-r bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
          C
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold">Coil Procurement Hub</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className="mb-3">
              {!collapsed && groupLabel(group) && (
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {groupLabel(group)}
                </div>
              )}
              {groupItems.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={t(item.labelKey as TranslationKey)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/70 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon name={item.icon} className="size-4 shrink-0" />
                    {!collapsed && <span className="truncate">{t(item.labelKey as TranslationKey)}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

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
