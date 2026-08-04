/**
 * ISO 3166-1 alpha-2 ülke kodundan bayrak emojisi (regional indicator).
 * Geçersiz/eksik kodda boş bayrak (🏳️) döner. Saf fonksiyon.
 */
export function countryFlag(iso: string | null | undefined): string {
  const code = (iso || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  const A = 0x1f1e6; // regional indicator "A"
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}
