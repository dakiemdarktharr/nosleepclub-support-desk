import { normalize } from "./text";
import { redact } from "./redaction";

export const INCIDENT_TTL_MS = 24 * 60 * 60_000;
export const FAQ_TTL_MS = 7 * INCIDENT_TTL_MS;
export type IncidentTopic = "NETWORK_OUTAGE" | "POWER_OUTAGE";
/** Closed descriptions only: added actions, negation, personal details and compound tasks do not qualify. */
export function incidentTopic(text: string): IncidentTopic | null {
  const n = normalize(text).replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim();
  if (redact(text).markers.length) return null;
  if (/^(?:su co |bao |cong ty |van phong )?(?:sap mang|mat mang|mang bi sap|mang bi mat|mang cong ty bi sap|mang cong ty bi mat)(?: cong ty| van phong| toan cong ty)?(?: hom nay| roi)?$/.test(n)) return "NETWORK_OUTAGE";
  if (/^(?:su co |bao |cong ty |van phong )?(?:cup dien|mat dien|dien bi mat)(?: cong ty| van phong| toan cong ty)?(?: hom nay| roi)?$/.test(n)) return "POWER_OUTAGE";
  return null;
}
export const incidentLabels: Record<IncidentTopic, string> = { NETWORK_OUTAGE: "Sự cố mạng", POWER_OUTAGE: "Sự cố điện" };
export const incidentMessages = {
  INVESTIGATING: "Nhân viên hỗ trợ đang kiểm tra sự cố tại khu vực này. Bạn không cần gửi lại cùng sự cố; cập nhật tiếp theo sẽ xuất hiện tại đây. Nếu có khói, mùi khét hoặc nguy hiểm, dừng thao tác và liên hệ bộ phận an toàn tại chỗ.",
  MONITORING: "Nhân viên hỗ trợ đang theo dõi tình trạng tại khu vực này. Bạn có thể kiểm tra lại kết nối hoặc thiết bị theo hướng dẫn an toàn đã nhận. Không tự sửa nguồn điện, thiết bị mạng hoặc bỏ kiểm soát bảo mật.",
  RESOLVED: "Nhân viên hỗ trợ đã đánh dấu sự cố chung đã khắc phục. Hãy kiểm tra lại và tự xác nhận kết quả trên hồ sơ của bạn. Nếu vẫn còn lỗi, giữ hồ sơ này và yêu cầu hỗ trợ riêng.",
} as const;

export function lexicalSimilarity(a: string, b: string) {
  const tokens = (s: string) => new Set(normalize(s).split(/[^a-z0-9]+/).filter(Boolean));
  const x = tokens(a), y = tokens(b);
  return x.size + y.size ? 2 * [...x].filter(t => y.has(t)).length / (x.size + y.size) : 0;
}
/** FAQ cache contains no open-ended prose, identities, network names or secrets. */
export function publicFaqTopic(text: string): string | null {
  if (redact(text).markers.length) return null;
  const n = normalize(text).replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim();
  if (/^vpn (?:khong ket noi|lien tuc ngat ket noi|bi ngat ket noi lien tuc)(?: (?:toi nen kiem tra gi(?: truoc)?|huong dan toi kiem tra an toan|huong dan kiem tra an toan))?$/.test(n)) return "vpn";
  if (/^(?:wifi|wi fi) (?:khong ket noi|khong vao duoc|khong hoat dong)(?: (?:toi nen kiem tra gi(?: truoc)?|huong dan kiem tra an toan))?$/.test(n)) return "wifi";
  return null;
}
