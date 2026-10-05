import { requireIdentitySession } from "./identity-auth";
/** Employee ID headers and job names never grant directory access. */
export const requireEmployeeDirectoryAccess = (request: Request) => requireIdentitySession(request, true);
