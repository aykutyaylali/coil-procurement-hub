import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/** Parola politikası: en az 8 karakter, harf ve rakam. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Parola en az 8 karakter olmalıdır.";
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password)) return "Parola en az bir harf içermelidir.";
  if (!/[0-9]/.test(password)) return "Parola en az bir rakam içermelidir.";
  return null;
}
