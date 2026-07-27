import { customAlphabet, nanoid } from "nanoid";
import { createHash, randomBytes } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const shortCode = customAlphabet(alphabet, 8);

/** URL-güvenli, tahmin edilemez token (magic link / reply token vb.) */
export function secureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Token'ın veritabanında saklanacak hash'i (ham token asla saklanmaz) */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Kısa, insan okunabilir referans kodu */
export function shortRef(): string {
  return shortCode();
}

export { nanoid };
