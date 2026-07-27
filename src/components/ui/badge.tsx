import * as React from "react";
import { cn } from "@/lib/utils";
import { statusLabel, statusTone } from "@/lib/enums";

const toneClasses: Record<string, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-[hsl(38_92%_38%)] dark:text-warning border-warning/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  info: "bg-primary/15 text-primary border-primary/30",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof toneClasses }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Durum kodunu Türkçe etiket + renk ile gösterir. */
export function StatusBadge({ status, locale = "tr" }: { status: string; locale?: string }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status, locale)}</Badge>;
}
