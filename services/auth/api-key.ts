import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@verita/database";
import { AppError } from "@/lib/errors";

const KEY_PREFIX = "vrt_live_";
const BCRYPT_ROUNDS = 10;

export function generateApiKeyMaterial() {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}${secret}`;
  const prefix = plaintext.slice(0, 12);
  const lastFour = plaintext.slice(-4);

  return { plaintext, prefix, lastFour };
}

export async function hashApiKey(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export async function verifyApiKey(plaintext: string, keyHash: string) {
  return bcrypt.compare(plaintext, keyHash);
}

export function extractBearerToken(authorization: string | null): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new AppError("Missing or invalid Authorization header", 401, "UNAUTHORIZED");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new AppError("Missing API key", 401, "UNAUTHORIZED");
  }

  return token;
}

export async function authenticateCustomerApiKey(authorization: string | null) {
  const plaintext = extractBearerToken(authorization);
  const prefix = plaintext.slice(0, 12);

  const candidates = await prisma.apiKey.findMany({
    where: {
      prefix,
      revokedAt: null,
      customer: { status: "ACTIVE" },
    },
    include: {
      customer: {
        include: {
          pricePlan: {
            include: { tiers: { orderBy: { tierOrder: "asc" } } },
          },
        },
      },
    },
  });

  for (const candidate of candidates) {
    const valid = await verifyApiKey(plaintext, candidate.keyHash);
    if (valid) {
      return {
        customer: candidate.customer,
        apiKey: candidate,
      };
    }
  }

  throw new AppError("Invalid API key", 401, "UNAUTHORIZED");
}

export function fingerprintApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
