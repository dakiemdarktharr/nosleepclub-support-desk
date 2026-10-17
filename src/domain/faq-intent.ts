import { normalize } from "./text-normalization";
import { redact } from "./redaction";

export type FaqTopic = "vpn:connection" | "vpn:disconnect" | "wifi:connection" | "printer:offline";
export const faqIntents: Record<FaqTopic, string> = {
  "vpn:connection": "VPN_NOT_CONNECTING",
  "vpn:disconnect": "VPN_NOT_CONNECTING",
  "wifi:connection": "WIFI_NOT_WORKING",
  "printer:offline": "DEVICE_PRINTER",
};

/** Closed semantic grammar, not a bag-of-words similarity or an LLM judgment.
 * Consume one resource, one symptom and optional conversational phrasing.
 * Unconsumed details, negation, actions or a second symptom make this ineligible.
 * Only these public facts may be shared; policy and template checks still follow.
 */
export function faqTopic(text: string): FaqTopic | null {
  if (text.length > 400 || redact(text).markers.length) return null;
  let rest = normalize(text).replace(/[.!?,;:]/g, " ");
  const subjects = [...rest.matchAll(/\b(vpn|wi fi|wifi|may in|printer)\b/g)];
  if (subjects.length !== 1) return null;
  const resource = subjects[0][0].replace("wi fi", "wifi").replace(/may in|printer/, "printer");
  rest = rest.replace(subjects[0][0], " ");
  const symptoms: Array<[string, RegExp]> = [
    ["disconnect", /\b(?:ngat ket noi|rot ket noi|mat ket noi lien tuc|ket noi chap chon|ket noi luc duoc luc khong|cu ket noi duoc la lai ngat|connection drops|keeps disconnecting)\b/g],
    ["connection", /\b(?:khong ket noi(?: duoc)?|ket noi khong duoc|chua ket noi(?: duoc)?|khong vao duoc|khong hoat dong|khong the ket noi|khong cach nao ket noi duoc|not connecting|cannot connect)\b/g],
    ["offline", /\b(?:offline|ngoai tuyen)\b/g],
  ];
  const matches = symptoms.flatMap(([name, pattern]) => [...rest.matchAll(pattern)].map(match => ({ name, text: match[0] })));
  if (matches.length !== 1) return null;
  const symptom = matches[0];
  rest = rest.replace(symptom.text, " ");
  // Whole phrases first, then function words. Never discard standalone negation,
  // conjunctions joining requests, named resources, numbers or operational verbs.
  rest = rest.replace(/\b(?:cho (?:minh|toi|em) hoi|co cach nao|lam the nao|lam sao|cach khac phuc|cach kiem tra|kiem tra gi(?: truoc)?|kiem tra tu dau|nen lam gi|phai lam gi|huong dan|ho tro|an toan|kho chiu|phien qua|chan that|lien tuc|thuong xuyen|luc nay|sang nay|hom nay|bao trang thai|trang thai|hien thi|please|help me|what should i check first)\b/g, " ");
  rest = rest.replace(/\b(?:toi|minh|em|ban|anh|chi|oi|hoi|tren|nho|giup|voi|nhe|nha|a|xin|cam|on|cua|dang|bi|bao|cu|hay|mai|hoai|qua|rat|nay|lai|roi|duoc|cho|nen|phai|can|muon|de|kiem|tra|the|nao|thi|tu|dau|truoc|it|my|is|the)\b/g, " ");
  if (rest.trim()) return null;
  const topic = `${resource}:${symptom.name}`;
  return Object.hasOwn(faqIntents, topic) ? topic as FaqTopic : null;
}
