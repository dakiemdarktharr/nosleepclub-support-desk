import { departmentOptions } from "./departments";
/** Unverified display context only. Never an employee identity or entitlement. */
export const guestDepartments = departmentOptions;
export type GuestDepartment = (typeof guestDepartments)[number];
export function isGuestDepartment(value: unknown): value is GuestDepartment {
  return typeof value === "string" && guestDepartments.some(department => department === value);
}
export function chooseGuestDepartment(previous?: GuestDepartment, random = Math.random): GuestDepartment {
  const choices = guestDepartments.filter(department => department !== previous);
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))];
}
