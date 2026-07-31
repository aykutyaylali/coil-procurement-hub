import { z } from "zod";

/**
 * Ortam değişkenleri şeması. Uygulama açılışında doğrulanır.
 * Eksik/yanlış değerlerde anlaşılır Türkçe hata verir.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("Coil Procurement Hub"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEFAULT_TIMEZONE: z.string().default("Europe/Istanbul"),
  DEFAULT_LOCALE: z.enum(["tr", "en"]).default("tr"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL zorunludur"),

  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET en az 32 karakter olmalıdır (güvenlik gereği)"),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().default(28800),
  MAGIC_LINK_TTL_HOURS: z.coerce.number().default(168),

  EMAIL_PROVIDER: z.enum(["mock", "smtp", "graph", "sendgrid", "ses"]).default("mock"),
  EMAIL_FROM: z.string().default("satinalma@example.com"),
  EMAIL_FROM_NAME: z.string().default("Coil Procurement Hub"),
  EMAIL_INBOUND_DOMAIN: z.string().default("rfq.example.com"),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),

  REDIS_URL: z.string().optional(),
  EXCHANGE_RATE_PROVIDER: z.enum(["tcmb", "manual", "mock"]).default("tcmb"),
  // LME bakır fiyatı otomatik çekme sağlayıcısı.
  //  web         : ücretsiz/anahtarsız — Yahoo Finance COMEX bakır (HG=F) → LME eşdeğeri (USD/ton)
  //  mock        : deterministik örnek (offline test)
  //  fastmarkets | lme_api : gerçek LME aboneliği (LME_API_URL + LME_API_KEY gerekir)
  LME_PROVIDER: z.enum(["web", "mock", "fastmarkets", "lme_api"]).default("web"),
  LME_API_URL: z.string().optional(),
  LME_API_KEY: z.string().optional(),
  ANTIVIRUS_PROVIDER: z.enum(["clamav", "none"]).default("none"),

  FEATURE_AI: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  FEATURE_SSO: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  AI_PROVIDER: z.enum(["none", "anthropic"]).default("none"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Ortam değişkenleri (.env) hatalı yapılandırılmış:\n${issues}\n\n` +
        `Lütfen .env.example dosyasını referans alın.`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
