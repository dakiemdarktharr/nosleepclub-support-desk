import { chooseGuestDepartment, isGuestDepartment, type GuestDepartment } from "@/domain/guest-session";

const key = "vng-guest-department-v1";
let memory: GuestDepartment | undefined;
function current(): GuestDepartment | undefined {
  try {
    const saved = window.sessionStorage.getItem(key);
    if (isGuestDepartment(saved)) return saved;
  } catch { /* Storage may be blocked; this tab remains usable. */ }
  return memory;
}
/** Start only on an explicit guest-entry action, not ordinary navigation/reload. */
export function startGuestSession(): GuestDepartment {
  memory = chooseGuestDepartment(current());
  try { window.sessionStorage.setItem(key, memory); } catch { /* In-tab fallback. */ }
  return memory;
}
export function ensureGuestSession(): GuestDepartment {
  return current() ?? startGuestSession();
}
