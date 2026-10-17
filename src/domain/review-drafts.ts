import { z } from "zod";
import { redact } from "./redaction";
import { asserted, detectedRisks, normalize } from "./text";
import { REVIEW_MESSAGE_MAX_LENGTH } from "./reviewer-messages";

export const draftKinds = ["QUESTION", "ANSWER", "ANSWER"] as const;
export type DraftSource = { id: string; text: string };
export const draftOutputSchema = z.object({
  options: z.array(z.object({
    kind: z.enum(["QUESTION", "ANSWER"]),
    text: z.string().trim().min(12).max(REVIEW_MESSAGE_MAX_LENGTH),
    evidenceIds: z.array(z.string()).min(1).max(12),
  }).strict()).length(3),
}).strict();
export type DraftOutput = z.infer<typeof draftOutputSchema>;
export class DraftValidationError extends Error {
  constructor(public code: "DRAFT_SCHEMA_INVALID" | "DRAFT_EVIDENCE_INVALID" |
    "DRAFT_INCOMPLETE_ANSWER" | "DRAFT_UNSAFE_CONTENT" | "DRAFT_STYLE_INVALID") {
    super(code);
  }
}

export function draftResponseSchema(sources: DraftSource[]) {
  return {
    type: "object", additionalProperties: false,
    properties: { options: { type: "array", minItems: 3, maxItems: 3,
      items: { type: "object", additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["QUESTION", "ANSWER"] },
          text: { type: "string" },
          evidenceIds: { type: "array", minItems: 1, maxItems: 12,
            items: { type: "string", enum: sources.map(source => source.id) } },
        }, required: ["kind", "text", "evidenceIds"],
      } } }, required: ["options"],
  };
}

const lineText = (line: string) => line.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "");
const comparable = (text: string) => text.replace(/\s+/g, " ").trim();

/** The model returns complete messages. Nothing is appended or silently repaired.
 * Vetted operational lines must remain complete, in order and on their own lines,
 * so a friendly introduction cannot negate or replace a safety instruction. */
export function validateDraftOutput(raw: unknown, sources: DraftSource[], requiredParts: string[]): DraftOutput {
  let value: unknown;
  try { value = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { throw new DraftValidationError("DRAFT_SCHEMA_INVALID"); }
  const parsed = draftOutputSchema.safeParse(value);
  if (!parsed.success) throw new DraftValidationError("DRAFT_SCHEMA_INVALID");
  const drafts = parsed.data;
  if (drafts.options.some((option, index) => option.kind !== draftKinds[index]) ||
      new Set(drafts.options.map(option => normalize(option.text))).size !== 3)
    throw new DraftValidationError("DRAFT_STYLE_INVALID");
  for (const [index, option] of drafts.options.entries()) {
    if (option.evidenceIds.some(id => !sources.some(source => source.id === id)) ||
        new Set(option.evidenceIds).size !== option.evidenceIds.length)
      throw new DraftValidationError("DRAFT_EVIDENCE_INVALID");
    if (redact(option.text).markers.length)
      throw new DraftValidationError("DRAFT_UNSAFE_CONTENT");
    let prose = option.text;
    if (index > 0) {
      const lines = option.text.split("\n").map(lineText).map(comparable).filter(Boolean);
      let next = 0;
      const extra: string[] = [];
      for (const line of lines) {
        if (next < requiredParts.length && line === comparable(requiredParts[next])) next++;
        else extra.push(line);
      }
      if (next !== requiredParts.length) throw new DraftValidationError("DRAFT_INCOMPLETE_ANSWER");
      prose = extra.join(" ");
      // Only the server's vetted lines can introduce operational actions.
      // Free prose may greet, explain or offer further support, not undo those lines.
      const additionalText = normalize(prose)
        .replace(/\b(?:chua|khong) the (?:ho tro )?/g, "khong ")
        .replace(/\b(?:tom tat|cam on|dong cam|cam thay|cam giac|bat dau|thao luan|thao tac)\b/g, " ");
      const additionalActions = /\b(?:bo qua|khong can lam|chi (?:can|lam)|thay the|ngoai tru|ignore|skip|instead|except|tat|bat|mo|khoi dong|restart|reboot|cai dat|install|thao|rut|cam|chay|cau hinh|configure|reset|thay doi|sua|xoa|cap quyen)\b/;
      if (/\?/.test(prose) || asserted(additionalText, additionalActions))
        throw new DraftValidationError("DRAFT_UNSAFE_CONTENT");
    }
    // A bounded warning is not a request for credentials. Do not strip any
    // following clause or values; redaction already rejects actual secrets.
    const text = normalize(prose).replace(
      /\b(?:khong|dung) (?:gui|chia se|cung cap) (?:mat khau|password|otp|token|secret|ma mfa|ma xac minh)(?:(?:,\s*|\s+(?:hoac|va)\s+)(?:mat khau|password|otp|token|secret|ma mfa|ma xac minh))*\b/g,
      "loi nhac an toan",
    );
    if (prose.length > (index === 0 ? 500 : 450) ||
        !/\b(?:ban|minh)\b/.test(normalize(option.text)) ||
        /^(?:can|de nghi)\b/.test(normalize(option.text)))
      throw new DraftValidationError("DRAFT_STYLE_INVALID");
    const commands = /https?:|www\.|\x60\x60\x60|\b(?:sudo|curl|powershell|cmd\.exe|wget|kubectl|chmod|regedit|netsh)\b/;
    const unsafeActions = /\b(?:cap|grant)\s+(?:quyen|access)\b|\b(?:disable|turn off|tat)\s+(?:mfa|edr|firewall)\b|\b(?:xoa|delete|wipe|format|factory reset)\b|\b(?:gui|chia se|cung cap)\s+(?:cho minh\s+)?(?:mat khau|password|otp|token|secret|ma mfa|ma xac minh)\b/;
    const falseClaims = /\b(?:da|already)(?:\s+duoc)?\s+(?:duyet|cap|mo|thuc hien|gui|khac phuc|xu ly|thong bao|approved|granted|opened|sent|resolved)\b|\b(?:guaranteed|chac chan)\b/;
    const credentials = /\b(?:password|otp|secret|mat khau|token|ma xac minh|ma mfa)\b/;
    if (commands.test(text) || asserted(text, unsafeActions) || asserted(text, credentials) || asserted(text, falseClaims) ||
        detectedRisks(text).some(risk => risk !== "USER_HANDOFF"))
      throw new DraftValidationError("DRAFT_UNSAFE_CONTENT");
  }
  return drafts;
}
