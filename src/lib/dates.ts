import { formatInTimeZone } from "date-fns-tz";

/**
 * Tüm tarihler UTC olarak saklanır; kullanıcının saat diliminde gösterilir.
 * Varsayılan saat dilimi: Europe/Istanbul.
 */
export const DEFAULT_TZ = "Europe/Istanbul";

export function formatDate(
  date: Date | string | null | undefined,
  tz = DEFAULT_TZ,
  pattern = "dd.MM.yyyy",
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  return formatInTimeZone(d, tz, pattern);
}

export function formatDateTime(
  date: Date | string | null | undefined,
  tz = DEFAULT_TZ,
): string {
  return formatDate(date, tz, "dd.MM.yyyy HH:mm");
}

export function nowUtc(): Date {
  return new Date();
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600_000);
}

export function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}

export function isPast(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getTime() < Date.now();
}
