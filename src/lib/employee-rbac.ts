import { getEmployees, type Employee } from "@/domain/employees";

export const AUTHORITY_LEVELS = {
  intern: 0,
  professional: 6,
  management: 21,
  executive: 31,
} as const;

export type AuthorityCheck =
  | { authorized: true; employee: Employee }
  | {
      authorized: false;
      status: 401 | 403;
      code: "AUTHENTICATION_REQUIRED" | "EMPLOYEE_NOT_FOUND" | "INSUFFICIENT_AUTHORITY";
      message: string;
    };

/** Creates a route guard that checks the mock employee identity and minimum level. */
export function checkAuthorityLevel(minRequiredLevel: number) {
  if (!Number.isInteger(minRequiredLevel) || minRequiredLevel < 0 || minRequiredLevel > 36) {
    throw new RangeError("Required authority level must be an integer from 0 through 36.");
  }

  return function authorizeEmployee(request: Request): AuthorityCheck {
    const employeeId = request.headers.get("x-employee-id")?.trim().toLowerCase();
    if (!employeeId) {
      return {
        authorized: false,
        status: 401,
        code: "AUTHENTICATION_REQUIRED",
        message: "Provide an employee ID in the X-Employee-ID header.",
      };
    }

    const employee = getEmployees().find((record) => record.id === employeeId);
    if (!employee) {
      return {
        authorized: false,
        status: 401,
        code: "EMPLOYEE_NOT_FOUND",
        message: "The employee ID is not present in the employee directory.",
      };
    }

    if (employee.level < minRequiredLevel) {
      return {
        authorized: false,
        status: 403,
        code: "INSUFFICIENT_AUTHORITY",
        message: `This action requires authority level ${String(minRequiredLevel).padStart(2, "0")} or higher.`,
      };
    }

    return { authorized: true, employee };
  };
}
