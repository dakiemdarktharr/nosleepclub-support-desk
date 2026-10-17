import { publicFaqTopic } from "@/domain/shared-support";
import { faqIntents, type FaqTopic } from "@/domain/faq-intent";
import type { CanonicalRequest, SupportInput } from "@/domain/contracts";
import { normalize, safeDeterministicGuidance } from "@/domain/text";

// This only avoids optional paraphrasing AFTER extraction and policy checks.
// A detailed/new question or follow-up still uses the normal answer path.
export function reviewedGuideAnswers(input: SupportInput, canonical: CanonicalRequest, round = 0) {
  const topic = publicFaqTopic(input.rawText) as FaqTopic | null;
  if (round === 0 && topic && canonical.intentLabel === faqIntents[topic] && safeDeterministicGuidance(input, canonical)) return true;
  if (round !== 0 || canonical.intentLabel !== "VPN_NOT_CONNECTING" ||
      !safeDeterministicGuidance(input, canonical)) return false;
  const clauses = normalize(input.rawText).split(/[.!?;\n]+/).map(value => value.trim()).filter(Boolean);
  const symptom = /^vpn(?: (?:van|dang|bi|lien tuc|thuong xuyen|keeps|is|still))* (?:ngat ket noi|khong ket noi(?: duoc)?|disconnecting|disconnected|not connecting|connection drops|connection failed|timeout)(?: (?:lien tuc|thuong xuyen|hoai|again|repeatedly|continuously))*$/;
  const safeHelp = /^(?:(?:hay|vui long) )?(?:(?:huong dan|chi) (?:toi|minh) (?:kiem tra|xu ly)(?: an toan)?|(?:toi|minh) (?:can|nen) kiem tra (?:gi truoc|tu dau)|what should i check first|please guide me through safe checks)$/;
  return clauses.length > 0 && symptom.test(clauses[0]) && clauses.slice(1).every(clause => safeHelp.test(clause));
}
