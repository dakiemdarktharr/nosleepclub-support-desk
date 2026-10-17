import { normalize } from "./text";

/** Quoted examples, role play and labeling instructions are not observations of the sender. */
export function observedFeedbackText(text: string): string {
  return text.replace(/```[\s\S]*?```|"[^"\n]*"|“[^”]*”|‘[^’]*’/g, " ")
    .split(/(?<=[.!?;\n])\s*/)
    .filter(clause => !/\b(?:gia vo|gia su|dong vai|vi du|hay phan loai|gan nhan|pretend|roleplay|role play|for example|classify|label this|act as|if i|neu toi)\b/.test(normalize(clause)))
    .join(" ");
}

export function reportsUnresolvedHelp(text: string): boolean {
  const value = normalize(observedFeedbackText(text));
  const unresolved = /\b(?:van|chua|khong).{0,30}(?:duoc|ket noi|hoat dong|hieu|vuong)|\b(?:still (?:stuck|broken|not working)|did not work|does not work|cannot connect|not fixed)\b/;
  const relatesToHelp = /\b(?:da thu|da lam|lam theo|thu theo|huong dan|buoc|luna|ban|tried|followed|your (?:steps|answer)|instructions)\b/;
  const terseFailure = /^(?:(?:toi|minh)\s+)?(?:van\s+)?(?:chua duoc|chua lam duoc|van con vuong|con vuong|still stuck|still not working)[.!? ]*$/;
  return terseFailure.test(value) || unresolved.test(value) && relatesToHelp.test(value);
}

/** Share local emotion negation with sentiment fallback, independently of the security parser. */
export function isEmotionCueNegated(prefix: string): boolean {
  return /\b(?:khong|chua|not|never|no|without)(?:\s+(?:he|con|cam|thay|rat|co|can|muon|phai|la|really|very|feel|feeling|at|all|need|want|to)){0,6}$/.test(normalize(prefix));
}

export function expressesFrustration(text: string): boolean {
  const observed = normalize(observedFeedbackText(text));
  const cues = /\b(?:buc minh|tuc gian|tuc qua|that vong|met moi|bat luc|frustrated|angry|fed up|useless|vo ich|(?:cho|doi) (?:qua )?lau)\b/g;
  for (const match of observed.matchAll(cues)) {
    if (!isEmotionCueNegated(observed.slice(0, match.index))) return true;
  }
  return false;
}

export function declinesHumanSupport(text: string): boolean {
  return /\b(?:khong|chua) (?:can|muon).{0,35}(?:nhan vien|admin|nguoi|chuyen)|\b(?:do not|don't|not) (?:want|need).{0,25}(?:human|agent)|\b(?:dung chuyen|tiep tuc voi luna|stay with luna)\b/.test(normalize(observedFeedbackText(text)));
}
