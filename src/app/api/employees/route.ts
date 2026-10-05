import { requireEmployeeDirectoryAccess } from "@/lib/employee-rbac";
import { identityStore } from "@/lib/identity-store";
import { supportApi } from "@/lib/support-http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return supportApi(async () => {
    await requireEmployeeDirectoryAccess(request);
    const { db } = await identityStore();
    return db.collection("identity_employees").find({}, { projection: { _id: 0, verifiedChannel: 0 } }).sort({ id: 1 }).limit(100).toArray();
  });
}
