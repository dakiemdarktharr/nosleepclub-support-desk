const key = "vng-guest-requests-v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let memory: string[] = [];
let writeFailed = false;

/** Only tracking IDs are saved. Ticket text and authoritative status stay on the server. */
export function guestRequestIds(): string[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(key) || "[]");
    if (Array.isArray(saved)) {
      const ids = saved.filter((id): id is string => typeof id === "string" && uuid.test(id)).map(id => id.toLowerCase());
      memory = [...new Set(writeFailed ? [...memory, ...ids] : ids)];
    }
  } catch { /* A blocked store still permits tracking in this tab. */ }
  return [...memory];
}

export function rememberGuestRequest(id: string) {
  if (!uuid.test(id)) return;
  const normalized = id.toLowerCase();
  memory = [normalized, ...guestRequestIds().filter(saved => saved !== normalized)];
  try { window.localStorage.setItem(key, JSON.stringify(memory)); writeFailed = false; }
  catch { writeFailed = true; /* Quota failures must not erase this tab's new tracking link. */ }
}
