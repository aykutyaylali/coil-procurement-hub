/**
 * DETERMİNİSTİK örnek LME USD/ton (tarihe bağlı; ~9.500–10.000 bandı). Rastgelelik yok.
 * "server-only" değildir → test edilebilir. Gerçek sağlayıcı bağlanınca kullanılmaz.
 */
export function mockLmeUsdPerTon(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000);
  return 9500 + (dayOfYear % 40) * 12.5; // 9500.00 .. 9987.50
}
