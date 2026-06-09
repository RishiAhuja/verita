import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1),
  OPS_API_KEY: z.string().min(8),
  WEBHOOK_SIGNING_SECRET: z.string().min(8),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) {
    return cached;
  }

  cached = serverEnvSchema.parse(process.env);
  return cached;
}
