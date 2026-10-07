import { hasInstructionAttack } from "./answer-safety";
import type { CanonicalRequest, SupportInput } from "./contracts";
import { normalize } from "./text";
import { isEmployeeIdentityField } from "./employee-identity";

export const conversationLabels = [
  "GREETING",
  "IDENTITY",
  "CAPABILITIES",
  "EVERYDAY",
  "GOOGLE_RECOVERY",
  "SOFTWARE_GUIDE",
  "CLOUD_GPU_GUIDE",
  "COMPANY_POLICY",
  "GENERAL_GUIDE",
] as const;
export type ConversationLabel = (typeof conversationLabels)[number];
export type ConversationContext = {
  label: ConversationLabel;
  question: string;
  ignoredOverride: boolean;
};

// Only strip an instruction-priority override. Keep the entire remaining payload for risk checks.
export function withoutOverride(raw: string) {
  return raw
    .replace(
      /(?:bỏ qua|bo qua|ignore)\s+(?:(?:tất cả|tat ca|all|các|cac|the|previous)\s+)*(?:instructions?|hướng dẫn|huong dan|chỉ dẫn|chi dan)(?:\s+(?:trước(?: đó)?|truoc(?: do)?|previous))?(?:\s+(?:và|va|and))?[,;:.!\s]*/gi,
      "",
    )
    .trim();
}
export function conversationEligible(
  input: SupportInput,
  baseline: CanonicalRequest,
  question: string,
) {
  if (
    baseline.riskSignals.length ||
    baseline.subrequests.some((part) => part.riskSignals.length) ||
    baseline.redactions.length ||
    !question ||
    hasInstructionAttack(question)
  )
    return false;
  const text = normalize(question);
  if (
    /system prompt|developer message|auto.approve|ignore.*instruction|bo qua.*(?:instruction|huong dan)|bypass|bo qua.*(?:phe duyet|chinh sach)/.test(text) ||
    /\b(?:cap|grant|provision|create|tao|mo|open|deploy|xoa|delete|doi|change)\b.{0,30}\b(?:quyen|access|vm|server|tai nguyen|resource|port|cong|database|db|firewall|role|production|pipeline)\b/.test(text)
  )
    return false;
  if (
    Object.entries(input.fields).some(
      ([key, value]) =>
        value &&
        !isEmployeeIdentityField(key) &&
        !(
          key === "intentLabel" &&
          /GUIDANCE|GENERAL_HOW_TO|COMPLIANCE_QUESTION|LOOKUP/.test(value)
        ),
    )
  )
    return false;
  return !input.requestKind || ["GUIDANCE", "OTHER"].includes(input.requestKind);
}
export function conversationMatchesBaseline(
  baseline: CanonicalRequest,
  label: ConversationLabel,
) {
  return (
    !["EVERYDAY", "IDENTITY", "CAPABILITIES", "GREETING", "GENERAL_GUIDE"].includes(label) ||
    baseline.intentLabel === "UNKNOWN_SUPPORT_REQUEST" ||
    (label === "GENERAL_GUIDE" && baseline.intentLabel === "GENERAL_HOW_TO")
  );
}
export function conversationRoute(
  input: SupportInput,
  baseline: CanonicalRequest,
): ConversationContext | null {
  const question = withoutOverride(input.rawText);
  const ignoredOverride = question !== input.rawText.trim();
  if (!conversationEligible(input, baseline, question)) return null;
  const text = normalize(question);
  const how =
    /lam sao|lam the nao|cach |huong dan|su dung|how (?:to|do|can)|explain|what is/.test(
      text,
    );
  const accessProblem = /khong.{0,45}(?:vao|dang nhap|mo).{0,25}duoc|khong vao duoc|(?:cannot|can't|can not|unable to).{0,25}(?:sign in|log in|login|access)|khoi phuc|lay lai|recover|quen|forgot|dang nhap|login/.test(text);
  let label: ConversationLabel | undefined;
  if (
    (/\b(?:google|gmail)\b/.test(text) ||
      (/\byoutube\b/.test(text) && /tai khoan|\bacc\b|\baccount\b|dang nhap|sign in|log in|login|recover|khoi phuc/.test(text))) && accessProblem
  )
    label = "GOOGLE_RECOVERY";
  else if (
    (how || /nen hoi ai|lien he ai|hoi nhom nao|who (?:should|do) i (?:ask|contact)/.test(text)) &&
    /\bgpu\b|cloud/.test(text)
  )
    label = "CLOUD_GPU_GUIDE";
  else if (
    /chinh sach|noi quy|quy dinh|company policy|employee policy/.test(text)
  )
    label = "COMPANY_POLICY";
  else if (
    how &&
    /tai |cai |download|install|phan mem|chuong trinh|software|ung dung/.test(
      text,
    )
  )
    label = "SOFTWARE_GUIDE";
  else if (
    /ban.*(?:xu ly|ho tro|lam duoc|giup).*gi|what can you|capabilities/.test(
      text,
    )
  )
    label = "CAPABILITIES";
  else if (/ban ten|ban la ai|your name|who are you/.test(text))
    label = "IDENTITY";
  else if (
    /an gi|an mon|mon an|bua (?:trua|toi)|cong thuc|banh kem|recipe|what.*eat|dinner|lunch/.test(
      text,
    )
  )
    label = "EVERYDAY";
  else if (
    /^(?:xin chao|chao(?: ban)?|hello|hi|hey|good morning)[!.? ]*$/.test(text)
  )
    label = "GREETING";
  else if (
    ["UNKNOWN_SUPPORT_REQUEST", "GENERAL_HOW_TO"].includes(baseline.intentLabel) &&
    (how || /[?？]$/.test(text) || /khong.{0,60}duoc|bi loi|gap loi|(?:cannot|can't|unable to).{0,45}|not working/.test(text))
  )
    label = "GENERAL_GUIDE";
  if (!label) return null;
  // A specific operational request cannot enter chat merely by mentioning food or greetings.
  if (!conversationMatchesBaseline(baseline, label)) return null;
  return { label, question, ignoredOverride };
}
export function conversationalCanonical(
  baseline: CanonicalRequest,
  conversation: ConversationContext,
): CanonicalRequest {
  return {
    ...baseline,
    conversation,
    requestKind: "GUIDANCE",
    serviceGroup: "OTHER",
    intentLabel: `CHAT_${conversation.label}`,
    requestedAction: "answer",
    missingFields: [],
    riskSignals: baseline.riskSignals,
    subrequests: baseline.subrequests,
    model: baseline.model,
  };
}
