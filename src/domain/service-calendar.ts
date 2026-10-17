import type { ServiceCalendar } from "./service-level-config";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 24 * HOUR;
const formatters = new Map<string, Intl.DateTimeFormat>();
function localInstant(at: number, zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    formatters.set(zone, formatter);
  }
  const fields = Object.fromEntries(formatter.formatToParts(at).map(item => [item.type, item.value]));
  return { date: `${fields.year}-${fields.month}-${fields.day}`,
    ms: (Number(fields.hour) * 3600 + Number(fields.minute) * 60 + Number(fields.second)) * 1000 + ((at % 1000) + 1000) % 1000 };
}
/** Integrate actual UTC intervals over a local working calendar. DST folds count
 * both real occurrences; missing local minutes count zero. Never guess a zone offset. */
export function businessElapsed(start: string, end: string, calendar: ServiceCalendar | null): number | null {
  const from = Date.parse(start), until = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until < from || !calendar) return null;
  if (calendar.mode === "CONTINUOUS") return until - from;
  // A bounded demo calculation fails explicitly instead of blocking a queue indefinitely.
  if (until - from > 3660 * DAY) return null;
  const holidays = new Set(calendar.holidays);
  function overlap(a: number, b: number): number {
    const left = localInstant(a, calendar!.timeZone), right = localInstant(b - 1, calendar!.timeZone);
    if (left.date !== right.date || right.ms - left.ms !== b - a - 1) {
      if (b - a <= MINUTE) {
        // UTC minute boundaries also split modern IANA offset transitions.
        return 0;
      }
      let total = 0;
      for (let minute = a; minute < b;) {
        const next = Math.min(b, (Math.floor(minute / MINUTE) + 1) * MINUTE);
        total += overlap(minute, next); minute = next;
      }
      return total;
    }
    if (holidays.has(left.date)) return 0;
    const weekday = new Date(`${left.date}T00:00:00Z`).getUTCDay();
    return (calendar!.week.find(row => row.day === weekday)?.intervals ?? []).reduce((sum, interval) =>
      sum + Math.max(0, Math.min(left.ms + b - a, interval.endMinute * MINUTE) - Math.max(left.ms, interval.startMinute * MINUTE)), 0);
  }
  let elapsed = 0;
  for (let cursor = from; cursor < until;) {
    const next = Math.min(until, (Math.floor(cursor / HOUR) + 1) * HOUR);
    elapsed += overlap(cursor, next); cursor = next;
  }
  return elapsed;
}
