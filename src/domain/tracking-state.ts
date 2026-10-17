import type { SupportRequest } from "./contracts";

/** A delayed group poll must never undo a newer reply/action in this tab. */
export function mergeTrackedRequest(previous: SupportRequest | null, latest: SupportRequest) {
  if (!previous || latest.id !== previous.id || latest.version < previous.version) return previous;
  return latest.version > previous.version || latest.incident?.version !== previous.incident?.version ||
    latest.incident?.expired !== previous.incident?.expired ? latest : previous;
}
