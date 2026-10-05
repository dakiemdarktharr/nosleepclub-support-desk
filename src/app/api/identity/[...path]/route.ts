import { z } from "zod";
import { applicationInputSchema, evaluateScope, profileSchema, scopeSchema, type IdentityApplication, type JobProfile } from "@/domain/identity";
import { successResponse } from "@/lib/api-response";
import { identityRateLimit, identitySessionCookie, logoutIdentity, requireIdentitySession, startIdentityLogin, verifyIdentityLogin } from "@/lib/identity-auth";
import { identityStore, identityTransaction } from "@/lib/identity-store";
import { supportApi, supportBody } from "@/lib/support-http";
import { SupportError } from "@/lib/support-repository";
import { decideIdentityApplication, identityAudit, listIdentityProfiles, submitIdentityApplication, trackIdentityApplication } from "@/services/identity";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  return supportApi(async () => {
    const { path } = await context.params;
    if (path.join("/") === "profiles") return listIdentityProfiles();
    if (path.join("/") === "session") {
      const { employee, assurance } = await requireIdentitySession(request);
      return { id: employee.id, name: employee.fullName, assurance, canReviewIds: assurance === "verified" && employee.roles.includes("identity-admin") };
    }
    if (path.length === 2 && path[0] === "applications") return trackIdentityApplication(z.string().uuid().parse(path[1]), z.string().regex(/^[a-f0-9]{64}$/).parse(request.headers.get("x-tracking-token")));
    await requireIdentitySession(request, true);
    const { db } = await identityStore();
    if (path.join("/") === "review" || path.join("/") === "audit") {
      const params = new URL(request.url).searchParams;
      const page = z.coerce.number().int().min(1).max(10000).parse(params.get("page") ?? 1);
      const pending = z.enum(["pending", "all"]).parse(params.get("status") ?? "all");
      const isReview = path[0] === "review";
      const query = isReview && pending === "pending" ? { status: { $in: ["PENDING", "ID_CONFLICT"] as const } } : {};
      const rows = await db.collection<IdentityApplication>(isReview ? "identity_applications" : "identity_audit").find(query, { projection: isReview ? { _id: 0, trackingHash: 0, fingerprint: 0 } : { _id: 0 } }).sort(isReview ? { createdAt: -1, id: 1 } : { at: -1, id: 1 }).skip((page - 1) * 50).limit(51).toArray();
      return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
    }
    throw new SupportError("NOT_FOUND", "Không tìm thấy chức năng.", 404);
  });
}
export async function POST(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    const route = path.join("/");
    const body = await supportBody(request);
    if (route === "login" || route === "verify") {
      await identityRateLimit("authentication", 100);
      const result = route === "login" ? await startIdentityLogin(body) : await verifyIdentityLogin(body);
      if ("token" in result && result.token) {
        const response = successResponse({ assurance: result.assurance });
        response.headers.set("set-cookie", identitySessionCookie(result.token));
        return response;
      }
      return successResponse(result);
    }
    if (route === "logout") {
      await logoutIdentity(request);
      const response = successResponse({ signedOut: true });
      response.headers.set("set-cookie", identitySessionCookie("", true));
      return response;
    }
    if (route === "applications") {
      const input = applicationInputSchema.parse(body);
      await identityRateLimit("applications", 30);
      return successResponse(await submitIdentityApplication(input), { status: 201 });
    }
    if (route === "access") {
      const { employee, assurance } = await requireIdentitySession(request);
      if (assurance !== "verified") throw new SupportError("VERIFICATION_REQUIRED", "Phiên demo không được dùng để thực thi quyền tài nguyên.", 403);
      const scope = scopeSchema.parse(body);
      const result = await identityTransaction(async (db, session) => {
        const row = await db.collection<JobProfile>("identity_profiles").findOne({ id: employee.profileId, version: employee.profileVersion, active: true }, { session });
        const decision = evaluateScope(row ? profileSchema.parse(row).scopes : [], scope);
        await identityAudit(db, session, employee.id, "SCOPE_CHECK", employee.id, JSON.stringify({ scope, ...decision }));
        return decision;
      });
      return successResponse({ ...result, executed: false });
    }
    if (path.length === 2 && path[0] === "review") {
      const { employee } = await requireIdentitySession(request, true);
      return successResponse(await decideIdentityApplication(z.string().uuid().parse(path[1]), body, employee.id));
    }
    throw new SupportError("NOT_FOUND", "Không tìm thấy chức năng.", 404);
  } catch (error) { return supportApi(async () => { throw error; }); }
}
