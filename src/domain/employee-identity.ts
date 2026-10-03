import { fieldOptions } from "./catalog";

export const employeeIdPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function normalizeEmployeeId(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function employeeIdentityError(fields: Record<string, string>) {
  if (!fieldOptions.department.includes(fields.department?.trim()))
    return "Chọn phòng ban trước khi gửi yêu cầu.";
  const employeeId = normalizeEmployeeId(fields.employeeId ?? "");
  if (!employeeId)
    return "Nhập mã nhân viên để liên kết yêu cầu với hồ sơ người gửi.";
  if (!employeeIdPattern.test(employeeId))
    return "Mã nhân viên chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới (tối đa 32 ký tự).";
  return "";
}

export function isEmployeeIdentityField(field: string) {
  return field === "department" || field === "employeeId";
}

export function employeeIdentityOnly(fields: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(fields).filter(([field]) => isEmployeeIdentityField(field)),
  );
}
