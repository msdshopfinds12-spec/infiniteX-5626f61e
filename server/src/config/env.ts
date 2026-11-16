import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(60),
  RATE_LIMIT_WINDOW: z.string().default("1 minute")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(source);
}

export function parseCorsOrigins(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
