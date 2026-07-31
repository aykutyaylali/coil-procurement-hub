import "server-only";
import { env } from "@/lib/env";

/**
 * AI sağlayıcı seçimi.
 * - "local": ÜCRETSİZ, anahtarsız, yerel heuristik (varsayılan). Maliyet yok.
 * - "anthropic": .env'de AI_PROVIDER=anthropic + ANTHROPIC_API_KEY tanımlıysa
 *   gerçek Claude kullanılır (henüz bağlanmadıysa local'e düşer).
 *
 * Not: Gerçek Claude çağrısı ancak geçerli anahtar sağlandığında etkinleşir;
 * anahtar yoksa sessizce local moda düşer (uygulama her koşulda çalışır).
 */
export type AiMode = "local" | "anthropic";

export function aiMode(): AiMode {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (env.AI_PROVIDER === "anthropic" && key) return "anthropic";
  return "local";
}

export function isAiEnabled(): boolean {
  return aiMode() === "anthropic";
}
