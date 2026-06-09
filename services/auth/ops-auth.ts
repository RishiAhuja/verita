import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export function authenticateOpsRequest(authorization: string | null) {
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;

  if (!token || token !== getServerEnv().OPS_API_KEY) {
    throw new AppError("Invalid ops credentials", 401, "UNAUTHORIZED");
  }

  return { actorId: "ops-user" };
}
