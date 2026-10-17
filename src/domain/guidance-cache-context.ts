import { faqTopic, faqIntents } from "./faq-intent";
import { normalize } from "./text-normalization";
import { redact } from "./redaction";

/** Closed public facts only. Keep OS and timeout separate from generic FAQs;
 * reject all remaining qualifiers, named resources, negations and extra tasks. */
export function guidanceCacheContext(text: string) {
  if (text.length > 400 || redact(text).markers.length) return null;
  let rest = normalize(text);
  const platforms = [...rest.matchAll(/\b(?:tren |on )?(windows|macos|mac os|macbook)\b/g)];
  const timeouts = [...rest.matchAll(/\b(?:loi timeout|timeout|timed out|het thoi gian cho ket noi)\b/g)];
  if (platforms.length > 1 || timeouts.length > 1 || !platforms.length && !timeouts.length) return null;
  const platform = platforms[0]?.[1] === "windows" ? "windows" : platforms.length ? "macos" : "unspecified";
  if (platforms.length) rest = rest.replace(platforms[0][0], " ");
  if (timeouts.length) rest = rest.replace(timeouts[0][0], "khong ket noi");
  const topic = faqTopic(rest);
  if (!topic || timeouts.length && topic !== "vpn:connection") return null;
  return { topic: `${timeouts.length ? "vpn:timeout" : topic}:${platform}`, intent: faqIntents[topic] };
}
