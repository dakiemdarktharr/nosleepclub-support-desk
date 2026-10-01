import { getEmployees } from "@/domain/employees";
import { errorResponse, successResponse } from "@/lib/api-response";
import { AUTHORITY_LEVELS, checkAuthorityLevel } from "@/lib/employee-rbac";

export const dynamic = "force-dynamic";

const authorizeDirectoryRead = checkAuthorityLevel(AUTHORITY_LEVELS.management);

export function GET(request: Request) {
  try {
    const access = authorizeDirectoryRead(request);
    if (!access.authorized) {
      return errorResponse(access.code, access.message, access.status);
    }

    return successResponse(getEmployees());
  } catch (error) {
    console.error("Unable to load the mock employee directory.", error);
    return errorResponse("EMPLOYEE_DIRECTORY_UNAVAILABLE", "The employee directory is unavailable.", 500);
  }
}
