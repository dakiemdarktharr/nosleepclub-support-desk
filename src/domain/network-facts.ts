import type { Extraction } from "./contracts";
import { allFields } from "./catalog";

// These are intake facts, not an allow-list of ports or an authorization rule.
// The current contract has one connection port; it cannot represent a range,
// multiple destinations, or a source-port restriction as a single destination.
export const networkFactLabels = {
  source: "source|nguồn|nguon",
  target: "target|destination|dest|đích|dich",
  port: "port|ports|cổng|cong|destination port|dest port|target port|source port|src port|cổng đích|cổng nguồn|port đích|port nguồn",
  protocol: "protocol|giao thức|giao thuc",
};

const numeric = "[+−–-]?\\d+(?:\\.\\d+)?";
const separator = "(?:[-–—]|to\\b|through\\b|đến\\b|den\\b|,|/|and\\b|và(?=\\s)|va\\b|or\\b|hoặc\\b|hoac\\b)";
const selector = `${numeric}(?:\\s*${separator}\\s*${numeric})*`;
const portLabel = "(?:(?:source|src|destination|dest|dst|target)\\s+ports?|(?:ports?|cổng|cong)(?:\\s+(?:nguồn|nguon|đích|dich))?)";
const protocolNames = "TCP|UDP|HTTPS|SSH|RDP|Other";
const labelledFields = [...allFields, ...Object.values(networkFactLabels)].join("|");
// A comma separates values unless it starts the next known labelled field.
// Stopping at every comma would silently choose TCP from "TCP, UDP".
const labelledValue = `([^;\\n]+?)(?=$|[;\\n]|,\\s*(?:${labelledFields})\\s*[:=])`;

export function isSingleNetworkPort(value: string): boolean {
  return /^\d{1,5}$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 65535;
}

export function isSingleNetworkProtocol(value: string): boolean {
  return /^(TCP|UDP|HTTPS|SSH|RDP|Other)$/i.test(value.trim());
}

export function sameNetworkFact(field: string, left: string, right: string): boolean {
  if (field === "port" && isSingleNetworkPort(left) && isSingleNetworkPort(right)) return Number(left) === Number(right);
  if (field === "protocol") return left.trim().toUpperCase() === right.trim().toUpperCase();
  // A hyphen, slash or minus is part of a resource identifier/value, not prose.
  return left.trim() === right.trim();
}

type NetworkFacts = Pick<Extraction, "entities" | "evidence" | "missingFields" | "ambiguities"> & {
  conflict: boolean;
};

/** Extract only explicit, bounded facts. Keep original quotes for a reviewer;
 * never infer protocol, endpoint, environment or ownership from a port number. */
export function extractNetworkFacts(
  rawText: string,
  isAsserted: (quote: string, index: number) => boolean,
): NetworkFacts {
  const result: NetworkFacts = { entities: {}, evidence: [], missingFields: [], ambiguities: [], conflict: false };
  const unresolved = (field: string, quotes: string[]) => {
    if (!result.missingFields.includes(field)) result.missingFields.push(field);
    result.ambiguities.push(`${field}: cần xác nhận một giá trị hợp lệ; đã nêu ${quotes.join(" / ")}`.slice(0, 300));
  };
  const remember = (field: string, quote: string) => {
    // The full original input remains evidence even if many facts are present.
    if (result.evidence.length < 12 && !result.evidence.some(item => item.field === field && item.quote === quote))
      result.evidence.push({ field, quote });
  };
  const ports: { value: string; quote: string; labelled: boolean }[] = [];
  const protocols: string[] = [];
  const recordProtocol = (value: string, quote: string, index: number) => {
    if (!isAsserted(quote, index)) return;
    protocols.push(value);
    remember("protocol", value);
  };
  let sourcePortStated = false;
  const portPattern = new RegExp(`(?<![\\p{L}\\p{N}_])(${portLabel})\\s*(?:[:=]|là(?=\\s)|la\\b)?\\s*(${selector})(?![\\p{L}\\p{N}_+−–—-]|\\.\\d|/(?!${protocolNames}\\b))`, "giu");
  for (const match of rawText.matchAll(portPattern)) {
    const before = rawText.slice(0, match.index).match(new RegExp(`\\b((?:${protocolNames})(?:\\s*(?:/|,|or\\b|and\\b|và(?=\\s))\\s*(?:${protocolNames}))*)\\s+$`, "i"));
    const quote = `${before?.[0] ?? ""}${match[0]}`;
    const start = match.index - (before?.[0].length ?? 0);
    if (!isAsserted(quote, start)) continue;
    const isSource = /source|src|nguồn|nguon/i.test(match[1]);
    sourcePortStated ||= isSource;
    remember(isSource ? "input" : "port", isSource ? match[0] : match[2]);
    if (!isSource) ports.push({ value: match[2], quote: match[0], labelled: /[:=]/.test(match[0]) });
    if (before) recordProtocol(before[1], quote, start);
    const after = rawText.slice(match.index + match[0].length).match(new RegExp(`^(?:\\s*/\\s*|\\s+)((?:${protocolNames})(?:\\s*(?:/|,|or\\b|and\\b|và(?=\\s))\\s*(?:${protocolNames}))*)\\b`, "i"));
    if (after) recordProtocol(after[1], `${quote}${after[0]}`, start);
  }
  if (ports.length) {
    const distinct = new Set(ports.map(item => isSingleNetworkPort(item.value) ? String(Number(item.value)) : item.value));
    if (distinct.size === 1 && ports.every(item => isSingleNetworkPort(item.value))) result.entities.port = ports[0].value;
    else {
      unresolved("port", ports.map(item => item.quote));
      // Two contrary field assignments are a real conflict. A list or range
      // is instead an unresolved scope, not evidence of authority conflict.
      result.conflict ||= distinct.size > 1 && ports.filter(item => item.labelled).length > 1;
    }
  }
  // Source-only input has not supplied a destination/connection port. A later
  // explicit form answer may fill that missing fact without narrowing a list.
  if (sourcePortStated && !ports.length) result.missingFields.push("port");
  // Labelled protocols may be unsupported or multi-valued: preserve the whole
  // value rather than selecting a recognized substring from it.
  const labelledProtocol = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${networkFactLabels.protocol})\\s*[:=]\\s*${labelledValue}`, "giu");
  for (const match of rawText.matchAll(labelledProtocol)) recordProtocol(match[1].trim(), match[0], match.index);
  if (protocols.length) {
    const distinct = new Set(protocols.map(value => value.toUpperCase()));
    if (distinct.size === 1 && protocols.every(isSingleNetworkProtocol)) {
      const value = protocols[0].toUpperCase();
      result.entities.protocol = value === "OTHER" ? "Other" : value;
    } else unresolved("protocol", protocols);
  }

  // Source and destination must be labelled; "ra Internet" alone does not
  // establish both endpoints, a device owner, or its environment.
  for (const field of ["source", "target"] as const) {
    const values: string[] = [];
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${networkFactLabels[field]})\\s*[:=]\\s*${labelledValue}`, "giu");
    for (const match of rawText.matchAll(pattern)) {
      if (!isAsserted(match[0], match.index)) continue;
      values.push(match[1].trim());
      remember(field, match[1].trim());
    }
    if (!values.length) continue;
    const distinct = new Set(values);
    if (distinct.size === 1 && values[0].length <= 300 && !values[0].includes(","))
      result.entities[field] = values[0];
    else {
      unresolved(field, values);
      result.conflict ||= distinct.size > 1;
    }
  }
  return result;
}
