import { supportApi } from "@/lib/support-http";
import { supportDatabase, supportStorageMode } from "@/lib/support-repository";
import { POLICY_VERSION } from "@/domain/policy-source";
export const dynamic = "force-dynamic";
export function GET() {
  return supportApi(async () => {
    const db = supportDatabase();
    if (db) await db.command({ ping: 1 });
    return {
      status: "ok",
      app: "MLAI_SUPPORT_REFEREE_V3",
      storage: supportStorageMode(),
      durable: !!db,
      // Adapter selection and ping do not demonstrate restart durability.
      persistenceVerification: "NOT_PERFORMED",
      provider: process.env.AI_PROVIDER || "mock",
      model: process.env.AI_PROVIDER === "openai" ? process.env.AI_MODEL || null : null,
      // Configuration and database ping are not an inference/API-key check.
      modelConnectivity: "NOT_CHECKED",
      policy: POLICY_VERSION,
      sourceRevision:
        process.env.APP_REVISION ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        "local",
      simulated: true,
    };
  });
}
