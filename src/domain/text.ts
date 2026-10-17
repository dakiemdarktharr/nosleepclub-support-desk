import { normalize } from "./text-normalization";
export { normalize } from "./text-normalization";
import { faqTopic, faqIntents } from "./faq-intent";
import { guidanceCacheContext } from "./guidance-cache-context";
import { allFields, catalog, validIntent } from "./catalog";
import type {
  CanonicalRequest,
  Environment,
  Extraction,
  RequestKind,
  RiskSignal,
  ServiceGroup,
  SupportInput,
} from "./contracts";
import { redact } from "./redaction";
import { isEmployeeIdentityField } from "./employee-identity";
import { guidanceRules, permissionMappings } from "./policy-source";
import { extractNetworkFacts, isSingleNetworkPort, isSingleNetworkProtocol, networkFactLabels, sameNetworkFact } from "./network-facts";

// Extraction fixes do not change rule definitions, but previously parsed
// previews must be re-evaluated before confirmation under the new boundary.
export const INTAKE_REVISION = "support-intake-v3-public-guidance-context";

// One vocabulary for extracting a labelled fact and keeping it with its request.
const factLabels: Record<string, string> = {
  resourceScope: "resourceScope|resource scope|database name|database|db|cơ sở dữ liệu|database đích",
  targetSystem: "targetSystem|target system|ứng dụng|hệ thống",
  namespace: "namespace", workload: "workload|pod|deployment", cluster: "cluster|cụm",
  source: "source|nguồn", target: "target|đích", reason: "reason|lý do|mục đích",
  operation: "operation|thao tác", repository: "repository|repo", pipeline: "pipeline",
  provider: "provider|nhà cung cấp",
  duration: "duration|thời hạn|thoi han|TTL",
  dataSensitivity: "dataSensitivity|data classification|phân loại dữ liệu",
  resourceLifecycle: "resourceLifecycle|resource lifecycle|vòng đời tài nguyên",
};

// Only documented lexical equivalences; never infer a new resource or authority.
export function normalizeFact(value: string) {
  return normalize(value)
    .replace(/\bpostgres\b/g, "postgresql")
    .replace(/\b(?:chi doc|chi xem|read only)\b/g, "read only")
    .replace(/\b(?:gio|tieng|hrs?|hours?)\b/g, "hours")
    .replace(/\b(?:ngay|days?)\b/g, "days");
}

function statedPermission(text: string) {
  return asserted(text, /\badmin\b|\broot\b|\bowner\b/)
    ? text.match(/\b(admin|root|owner)\b/)?.[1]
    : asserted(text, /read.only|\bread\b|\bselect\b|chi doc|chi xem/)
      ? "read-only"
      : asserted(text, /write|quyen ghi/)
        ? "write"
        : undefined;
}

/** Keep server semantics only when the literal quote independently confirms
 * the same fact. Evidence remains the original quote; this never creates proof. */
export function normalizeQuotedFact(field: string, quote: string, baseline: CanonicalRequest): string {
  const prior = baseline.entities[field];
  if (!prior) return quote;
  if (field === "duration") {
    const bounded = /^(?:(?:for|trong|duration|ttl|thoi han)\s*[:=]?\s*)?(?:\d+(?:\.\d+)?|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:hours?|hrs?|h|days?|ngay|gio|tieng|phut|minutes?)$/;
    const negative = /(?:^|[\s:=])[-−–]\s*\d/;
    if (!bounded.test(normalize(quote)) || negative.test(quote) || negative.test(prior)) return quote;
    const duration = statedDuration(`duration ${quote}`);
    return duration && normalizeFact(duration) === normalizeFact(prior) ? prior : quote;
  }
  if (field !== "permission" && field !== "accessType") return quote;
  const normalized = normalize(quote);
  const permission = statedPermission(normalized);
  const plainPermission = /^(?:read[ -]?only|read|select|chi doc|chi xem|write|quyen ghi|admin|root|owner)$/;
  if (plainPermission.test(normalized) && permission && normalizeFact(permission) === normalizeFact(prior)) return prior;
  for (const mapping of permissionMappings) {
    if (mapping.serviceGroup !== baseline.serviceGroup || mapping.field !== field ||
        mapping.value !== prior || mapping.system && mapping.system !== baseline.entities.system) continue;
    // A quoted bare role name may use the existing mapping only because the
    // complete input already established that role in this exact service.
    for (const phrase of [normalized, `role ${normalized}`]) {
      if (phrase.match(mapping.pattern)?.[0] === phrase) return prior;
    }
  }
  return quote;
}

// Lexical facts only. A relative weekday/sprint needs clarification, not a
// guessed timestamp; a numeric TTL does not prove an ephemeral lifecycle.
const relativeDuration = /\b(?:dung den|thoi han den|until)\s+(?:het\s+)?(?:thu (?:hai|ba|tu|nam|sau|bay)|cuoi sprint|cuoi tuan|ngay mai|end of (?:sprint|week)|friday)\b/;

function statedDuration(rawText: string) {
  const range = rawText.normalize("NFKC").match(/\d+(?:\.\d+)?\s*(?:to|đến|den|[-–])\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?|h\b|days?|ngày|ngay|giờ|gio|tiếng|tieng|phút|phut|minutes?)(?![A-Za-z])/i);
  if (range) return range[0]; // Preserve ambiguity so missingFacts asks, not choose the smaller interval.
  const numeric = [...rawText.normalize("NFKC").matchAll(
    /(?<![\w.])[-+−–]?\d+(?:\.\d+)?\s*(?:hours?|hrs?|h\b|days?|ngày|ngay|giờ|gio|tiếng|tieng|phút|phut|minutes?)(?![A-Za-z])/gi,
  )];
  const intervals = [...new Set(numeric.map(match =>
    `${/^[-−–]/.test(match[0]) ? "negative " : ""}${normalizeFact(match[0])}`,
  ))];
  if (intervals.length > 1) return intervals.join(" / ");
  if (numeric.length) return numeric[0][0];
  const text = normalize(rawText.replace(/\r?\n/g, ";"));
  const counts: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const words = text.match(/(?:\b(?:trong|for|ttl|duration|thoi han)\s*[:=]?\s*|(?:^|;)\s*)(mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|one|two|three|four|five|six|seven|eight|nine|ten)\s+(ngay|days?|gio|tieng|hours?|phut|minutes?)\b/);
  if (words) {
    const prefix = text.slice(0, words.index).split(/[,;.\n]|\b(?:but|nhung|va|and)\b/).at(-1) ?? "";
    if (!/\b(?:khong|chua|not|no|without|if|neu)\b/.test(prefix)) return normalizeFact(`${counts[words[1]]} ${words[2]}`);
  }
  return text.match(relativeDuration)?.[0];
}

function statedDataClassification(text: string) {
  // Never promote a caller's description into verified PolicyEvidence.
  const sensitive = asserted(text, /\b(?:customer|personal|sensitive|confidential|restricted|regulated)\s+data\b|\bdu lieu (?:khach hang|ca nhan|nhay cam)\b/);
  if (sensitive) return "sensitive";
  const pattern = /\bsynthetic (?:data|schema|traces|leads)\b|\bdata (?:la|is) synthetic\b|\bdu lieu gia(?: lap)?\b/g;
  for (const match of text.matchAll(pattern)) {
    const prefix = text.slice(0, match.index).split(/[,;.\n]|\b(?:but|nhung|va|and)\b/).at(-1) ?? "";
    if (!/\b(?:khong|chua|not|no|without|if|neu)\b/.test(prefix)) return "synthetic";
  }
  return undefined;
}

function isDurationOnlyContext(fragment: string) {
  return /^(?:(?:trong|for)\s+)?(?:\d+(?:\.\d+)?|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:hours?|hrs?|h|days?|ngay|gio|tieng|phut|minutes?)[.!]*$/.test(normalize(fragment));
}
// Negation is local to the matched phrase; it cannot cancel a later risky subrequest.
export function asserted(text: string, pattern: RegExp) {
  const matcher = new RegExp(pattern.source, "g");
  for (const match of text.matchAll(matcher)) {
    const prefix =
      text
        .slice(0, match.index)
        .split(/[,;.\n]|\b(?:but|nhung|however|va|and)\b/)
        .at(-1) ?? "";
    if (
      !/(?:\bkhong\b|\bnot\b|\bno\b|\bwithout\b|\bnever\b|don't|do not)(?:\s+(?:can|need|request|require|yeu|cau|co|muon|quyen|access|vao|to|for|any|a|an|the|production|real|true|admin|hay|or|mo|open|expose|service|bucket|server|services|buckets|servers|address|ip|public|port|rdp|ssh|inbound|remote|cap|grant|give|gui|send|share|token|private|key|internet|from|tu|ra|dung|dung den|dong|route|project|space|sua|thay doi|edit|modify|change|mount(?:ed|ing)?|\d+)){0,10}\s*$/.test(
        prefix,
      )
    )
      return true;
  }
  return false;
}

function hasDirectDatabaseOperation(text: string) {
  return asserted(
    text,
    // A document-title introducer cannot connect an earlier access verb to DB.
    // Other clauses (including comma-separated database access) remain checked.
    /\b(?:read|write|update|drop|delete|export|dump|query|connect|access)\b(?:(?!\b(?:page|document)\s+(?:co tieu de|is titled|titled)\b).){0,30}\b(?:(?:production|prod)\s+)?(?:database|db)\b|\b(?:(?:production|prod)\s+)?(?:database|db)\s+(?:access|read|write|update|drop|delete|export|dump|query)\b/,
  );
}

function hasDestructiveDatabaseOperation(text: string) {
  return asserted(text, /\b(?:drop|delete|truncate|xoa)\s+(?:the\s+)?(?:(?:production|prod|staging|sandbox|development|dev)\s+)?(?:database|db|table|bang|co so du lieu)\b|\bdelete from (?:table|bang)\b/) ||
    (hasDirectDatabaseOperation(text) && asserted(text, /\bdelete from\b/));
}

// An unresolved choice names a destructive option without requesting it. Keep
// other clauses intact, including any separate, affirmative factory reset.
function resetChoiceContext(text: string) {
  return text.replace(/\b(?:chua (?:quyet dinh|chon)|have not decided|haven't decided|not decided whether)\s+(?:restart|reboot|khoi dong lai)\s+(?:hay|or)\s+(?:factory reset|khoi phuc cai dat goc)\b/g,
    "reset type undecided");
}

function refersToExistingResource(text: string, resources: string) {
  const existing = String.raw`(?:existing|current|shared|hien co|dang co)`;
  return new RegExp(
    String.raw`\b(?:use|using|dung|su dung)\b.{0,35}\b(?:${resources})\b.{0,20}\b${existing}\b|\b(?:use|using|dung|su dung)\b.{0,25}\b${existing}\b.{0,20}\b(?:${resources})\b`,
  ).test(text);
}

function hasDirectNetworkOperation(text: string) {
  return asserted(
    text,
    /\b(?:open|change|modify|configure|expose|allow|enable|close|disable|mo|sua|thay doi)\b.{0,35}\b(?:port|firewall|rdp|public ip|network port)\b/,
  );
}

function collaborationDocumentAccess(text: string) {
  const collaborationResource =
    /\b(?:project|space|page|board|issue)\b/.test(text) ||
    /\b(?:jira|confluence)\b.{0,35}\b(?:access|permission)\b|\b(?:access|permission)\b.{0,35}\b(?:jira|confluence)\b/.test(
      text,
    );
  return (
    /\b(?:jira|confluence)\b/.test(text) &&
    collaborationResource &&
    /\b(?:access|permission|quyen|add|role|view|edit|browse|comment|read)\b/.test(text) &&
    !hasDirectDatabaseOperation(text) &&
    !hasDirectNetworkOperation(text)
  );
}

function documentationOnlyDatabaseReference(text: string) {
  return (
    collaborationDocumentAccess(text) &&
    /\b(?:production|prod)\s+(?:database|db)\b/.test(text)
  );
}

function standardVpnAccess(text: string) {
  return (
    /\bvpn\b/.test(text) &&
    /\b(?:standard|corporate|profile)\b/.test(text) &&
    /\b(?:need|want|request|grant|add|access|profile|cap|can|xin|nho)\b/.test(text) &&
    !hasDirectNetworkOperation(text)
  );
}

function databaseProvisioningRequest(text: string) {
  const databaseResource =
    String.raw`database|db|postgresql|postgres|mysql|mongodb|redis|clickhouse`;
  const createsResource =
    /\b(?:create|provision|tao|dung)\b.{0,45}\b(?:database|db|postgresql|postgres|mysql|mongodb|redis|clickhouse)\b/;
  const requestsResource =
    /\b(?:need|want|request|can|xin|nho|cap|cho|muon)\b.{0,45}\b(?:a|an|one|new|another|separate|dedicated|mot|moi|rieng|them)?\s*(?:staging|qa|uat|sandbox|development|dev|production|prod)?\s*(?:postgresql|postgres|mysql|mongodb|redis|clickhouse)\s+(?:database|db|instance|node)\b|\b(?:need|want|request|can|xin|nho|cap|cho|muon)\b.{0,45}\b(?:mongodb|redis|clickhouse)\s+(?:rieng|separate|dedicated)\b|\b(?:need|want|request|can|xin|nho|cap|cho|muon)\b.{0,45}\b(?:database|db)\b/;
  return !refersToExistingResource(text, databaseResource) &&
    !hasDirectDatabaseOperation(text) &&
    !/\b(?:access|permission|read|write|select|quyen)\b/.test(text) &&
    (createsResource.test(text) || requestsResource.test(text));
}

function computeProvisioningRequest(text: string) {
  const computeResourcePattern =
    String.raw`vm|may chu|server|host|node|worker|instance|etl (?:vm|server|box)|data node|spark driver(?: node)?|airflow worker|kafka connect(?: (?:host|worker|server|node))?|flink etl(?: server)?|trino coordinator|temporal worker|dbt runner`;
  const computeResource = new RegExp(String.raw`\b(?:${computeResourcePattern})\b`);
  const createsResource =
    new RegExp(String.raw`\b(?:provision|create|build|set up|setup|stand up|tao|dung|cap)\s+(?:(?:a|an|one|new|another|separate|dedicated|mot|moi|rieng|them|\d+)\s+){0,3}(?:${computeResourcePattern})\b`);
  const requestsResource =
    new RegExp(String.raw`\b(?:need|want|request|ask|can|xin|nho|cap|giup|muon)\s+(?:(?:minh|toi|team|infra|it)\s+)?(?:(?:a|an|one|new|another|separate|dedicated|mot|moi|rieng|them|additional|\d+)\s+){0,3}(?:${computeResourcePattern})(?:\s+(?:rieng|separate|dedicated))?\b`);
  const requestedCreation =
    new RegExp(String.raw`\b(?:need|want|request|ask|can|xin|nho|cap|giup|muon)\b.{0,24}\b(?:provision|create|build|set up|setup|stand up|tao|dung|cap)\b.{0,24}\b(?:${computeResourcePattern})\b`);
  // GPU-sized instances must stay on the GPU quota path; a generic instance alias
  // cannot convert a GPU request into a cloud VM request.
  if (/\b(?:gpu|a100|h100|t4|a10)\b/.test(text)) return false;
  return !refersToExistingResource(text, computeResourcePattern) &&
    !hasDirectDatabaseOperation(text) && !hasDirectNetworkOperation(text) &&
    !/\b(?:access|permission|read|write|select|quyen)\b/.test(text) &&
    (createsResource.test(text) || requestsResource.test(text) || requestedCreation.test(text)) &&
    computeResource.test(text);
}

function isNegatedControlRefusal(fragment: string) {
  const text = normalize(fragment);
  return (
    /^(?:(?:i|we|toi|minh)\s+)?(?:do not|dont|never|khong|khong duoc|khong can|khong yeu cau)\s+(?:bypass|skip|disable|turn off|bo qua|tat|vuot qua)\b/.test(text) &&
    /\b(?:mfa|2fa|change ticket|change control|approval|audit|logging|edr|firewall|tuong lua|security control|quy trinh thay doi|phieu thay doi)\b/.test(text)
  );
}

function isNegatedDeviceChangeRefusal(fragment: string) {
  return /^(?:(?:toi|minh|i|we)\s+)?(?:khong|khong duoc|do not|don't|never)\s+(?:cai(?: dat)?|cap nhat|install|update|upgrade)\s+(?:driver|drivers|firmware)[.!]*$/.test(normalize(fragment));
}

function isScopeConstraint(fragment: string) {
  const text = normalize(fragment);
  const startsWithConstraint =
    /^(?:(?:minh|toi|we|i)\s+|(?:this request|request(?: nay)?)\s+(?:is\s+)?)(?:no|not|without|khong|khong can|khong yeu cau|do not|don't|only|just|chi)\b/.test(
      text,
    ) || /^(?:no|not|without|khong|khong can|khong yeu cau|do not|don't|only|just|chi)\b/.test(text);
  const mentionsScope =
    /\b(?:public|production|secrets?|admin|database|db|server|firewall|port|ingress|route|network|access|quyen|synthetic)\b/.test(
      text,
    );
  const hasPositiveOperation = asserted(
    text.replace(/\b(?:only use|chi dung) synthetic (?:data|schema)\b/g, "synthetic scope"),
    /\b(?:need|want|grant|give|open|change|modify|configure|expose|allow|enable|close|disable|turn|export|deploy|delete|restart|create|provision|install|send|share|mount|bypass|run|drop|use|transfer|pay|migrate|execute|cap|mo|sua|trien khai|gui|xin|nho|can|dung|cai|chay|chuyen tien)\b/,
  );
  return startsWithConstraint && mentionsScope && !hasPositiveOperation;
}

function isResourceProvisioningContinuation(previous: string, fragment: string) {
  const prior = normalize(previous);
  const text = normalize(fragment);
  const followsProvisioningRequest =
    /\b(?:need|request|ask|want|xin|nho|can|cho|muon|tao|dung|cap|giup|provision|create|build|set up|setup)\b/.test(prior) &&
    /\b(?:sandbox|vm|etl|airflow|database|db|postgres(?:ql)?|mysql|mongodb|redis|clickhouse|kafka|worker|instance|server|host|node|cloud|gpu|spark|flink|trino|temporal|dbt)\b/.test(
      prior,
    );
  const continuesSameResource =
    /^(?:dag\b|data\b|volume\b|throughput\b|retention\b|sizing\b|instance size\b|timeframe\b|worker count\b|expected volume\b|(?:minh|toi|team|we|i)\s+(?:quen|forgot|chua|haven't|have not)\b|(?:request|this request)\s+(?:chua|not yet|still)\b|(?:chua|not yet|still)\b|(?:config|configuration|cau hinh)\b|(?:co|there are|around|about)\b|(?:dataset|vendor|manager|lead|deadline|go live|audit plan)\b|(?:muon (?:co )?(?:may|server|host|node|worker|instance))\b|(?:cu|just)\s+(?:dung|use|choose|recommend|build|set up|stand up)\b|(?:nho|please)\s+(?:helpdesk|team|infra|it)\s+(?:xu ly|handle|process|support)\b)/.test(
      text,
    ) || (
      /^(?:(?:neu duoc|if possible)(?: thi| then)?\s+|(?:nho|please)\s+(?:(?:team|it|infra)\s+)?)provision\b/.test(text) &&
      /\b(?:default|config|image|tier|standard|trong|today|hom nay|this week|tuan nay|giup)\b/.test(text) &&
      !/\b(?:another|new|them|khac|sandbox|vm|server|database|worker|instance|resource)\b/.test(text)
    );
  const sameResourceProvisioningInstruction =
    /^(?:(?:nho|please)\s+)?(?:(?:team|it|infra)\s+)*(?:set up|setup|provision|tao|dung|cap)\b/.test(text) &&
    (/\b(?:default|config|configuration|best practice|image|resource|server|host|node|worker|instance|database|db|giup|help)\b/.test(text) ||
      /^(?:nho|please)\s+(?:(?:team|it|infra)\s+)*(?:tao|dung|cap)\s+(?:giup|help)[.!]*$/.test(text));
  const negatedProcessContext =
    /^(?:khong|not|no|don't|do not)\b.*\b(?:bo(?: qua)?|skip|bypass)\b.*\b(?:quy trinh|process|approval|review|policy|form)\b/.test(text) &&
    !detectedRisks(fragment).includes("BYPASS");
  const startsSeparateRequest =
    /^(?:also|additionally|separately|another|and also|besides|ngoai ra|tien the|dong thoi|cung luc)\b/.test(
      text,
    );
  const introducesAnotherResource =
    /\b(?:another|new|separate|additional|different|extra|them|khac|moi)\s+(?:database|db|vm|server|host|node|worker|instance|sandbox|resource)\b/.test(text) ||
    /\b(?:database|db|vm|server|host|node|worker|instance|sandbox|resource)\s+(?:rieng|separate|dedicated)\b/.test(text);
  const pendingCapacityOrBudget =
    /\b(?:budget|quota|capacity|cost|spend)\b.{0,60}\b(?:pending|not approved|not passed|not reviewed|awaiting|chua|chua qua|chua duoc|chua co)\b|\b(?:pending|not approved|not passed|not reviewed|awaiting|chua|chua qua|chua duoc|chua co)\b.{0,60}\b(?:budget|quota|capacity|cost|spend)\b/.test(text);
  const assertsSensitiveOperation = asserted(
    text,
    /\b(?:drop|delete|export|dump|wipe|open|change|modify|configure|expose|allow|enable|disable|grant|give|send|share|mount|bypass|run|chay|transfer|pay|migrate|execute|chuyen tien)\b/,
  );
  const usesIndependentResource = asserted(
    text,
    /\buse\b.{0,35}\b(?:runner|script|tool|database|db|server|host|node|worker|instance|secret|token|credential|migration)\b/,
  );
  const unsafeContext = detectedRisks(fragment).some((risk) =>
    ["SECRET", "PUBLIC_EXPOSURE", "SECURITY_CONTROL", "BYPASS", "PRIVILEGED", "PRODUCTION_CHANGE", "DESTRUCTIVE", "DATA_EXPORT", "UNAPPROVED_SOFTWARE", "INJECTION"].includes(risk),
  );
  return (
    followsProvisioningRequest &&
    (continuesSameResource || sameResourceProvisioningInstruction || negatedProcessContext) &&
    !startsSeparateRequest &&
    !introducesAnotherResource &&
    !pendingCapacityOrBudget &&
    !assertsSensitiveOperation &&
    !usesIndependentResource &&
    !unsafeContext
  );
}

function isCollaborationScopeContinuation(previous: string, fragment: string) {
  const prior = normalize(previous);
  const text = normalize(fragment);
  const followsCollaborationAccess =
    /\b(?:jira|confluence)\b/.test(prior) &&
    /\b(?:project|space|page|board)\b/.test(prior) &&
    (/\b(?:access|permission|quyen|add|role|browse|view|edit|comment)\b/.test(prior) ||
      /^(?:jira project|confluence space)\b/.test(prior));
  // Complete permission descriptions add scope, not a second requested task.
  // Unknown roles remain unmapped facts; this does not define their entitlements.
  if (followsCollaborationAccess && (
    /^(?:(?:minh|toi|i|we) )?(?:can|need) (?:browse|create|comment|transition)(?:\/(?:browse|create|comment|transition))+(?:, (?:khong can|no) project admin)?[.!]*$/.test(text) ||
    /^quyen standard agent la du[.!]*$/.test(text)
  )) return true;
  const startsWithScope =
    /^(?:(?:minh|toi|i|we|request)\s+)?(?:only|just|chi|no|not|without|khong|do not|don't)\b/.test(
      text,
    );
  const describesAccessScope =
    /\b(?:user|editor|browse|create issue|transition issue|view|edit|comment|read(?: only)?|project admin|space admin|server|database|db|firewall|port|rdp)\b/.test(
      text,
    );
  return (
    followsCollaborationAccess &&
    startsWithScope &&
    describesAccessScope &&
    !hasDirectDatabaseOperation(text) &&
    !hasDirectNetworkOperation(text) &&
    !asserted(text, /\b(?:use|send|share|transfer|pay|migrate|execute|delete|drop|disable|install|mount|bypass|chuyen tien|gui|cai|chay)\b/)
  );
}

// Contract: a bounded permission description or device fact can continue an
// existing access request. An additional action or resource stays independent.
function isGitScopeContinuation(previous: string, fragment: string) {
  if (!/\b(?:github|gitlab|repository|repo)\b/.test(normalize(previous))) return false;
  const text = normalize(fragment);
  if (/^(?:(?:minh|toi) )?chi doc file [a-z0-9_.-]+(?:, khong push code)?[.!]*$/.test(text)) return true;
  const scope = text.replace(
    /^(?:(?:minh|toi|i|we)\s+)?(?:chi can|only need|only|just)\s+/,
    "",
  );
  if (scope !== text) {
    return scope.split(/[,;]|\b(?:and|va)\b/).every((clause) =>
      /^(?:(?:quyen|permission|role)\s+)?(?:read(?: only)?(?: access)?|write(?: access| permission)?|push branch|(?:open|mo) (?:a )?pr)[.!]*$/.test(clause.trim()) ||
      /^(?:no|not|without|khong(?: can)?)\s+(?:admin(?: access)?|owner(?: access)?|bypass branch protection)[.!]*$/.test(clause.trim()),
    );
  }
  const [description, ...limits] = text.split(",").map((clause) => clause.trim());
  return (
    /^(?:day chi la repo noi bo|this is (?:only|just) an? internal (?:repo|repository))[.!]*$/.test(description) &&
    limits.every((clause) => {
      // Each item in an explicitly negated install/run list shares that negation.
      const list = clause.replace(/^(?:khong|no|not)\s+/, "");
      return list !== clause && list.split(/\b(?:hay|or)\b/).every((item) =>
        /^(?:cai|install|chay|run)\s+[a-z0-9 -]+[.!]*$/.test(item.trim()) &&
        !/\b(?:and|va|but|nhung|then|send|share|transfer|chuyen|delete|drop|grant|open|bypass)\b/.test(item),
      );
    })
  );
}

function isVpnDeviceContext(previous: string, fragment: string) {
  return standardVpnAccess(normalize(previous)) &&
    /^(?:dung laptop (?:cong ty|corporate)(?: co edr day du)?|thiet bi la laptop managed cua cong ty|(?:using|from) (?:a )?(?:managed|company|corporate) laptop(?: with edr)?)(?: (?:va|and) (?:khong can|no) production route(?: rieng)?)?[.!]*$/.test(normalize(fragment));
}

function isVpnScopeContinuation(previous: string, fragment: string) {
  return standardVpnAccess(normalize(previous)) &&
    /^(?:(?:minh|toi|i|we) )?(?:chi can|only need) access corporate network (?:theo role hien tai|with (?:my |the )?current role)[.!]*$/.test(normalize(fragment));
}

function isDatabaseAuthorizationContext(previous: string, fragment: string) {
  if (!hasDirectDatabaseOperation(normalize(previous))) return false;
  const text = normalize(fragment);
  return (
    /^(?:cfo|business owner|finance owner|data owner) (?:da |has )?(?:ok|approved|approve) (?:ve|for) business purpose (?:tren|on|in|via) (?:zalo chat|slack|email)[,.!]*$/.test(text) ||
    /^(?:chua co|no|without|not yet) (?:dba|data owner) sign off[.!]*$/.test(text) ||
    /^(?:nho cap tam|please grant temporary access) (?:den|until) (?:sang mai|ngay mai|tomorrow(?: morning)?)[.!]*$/.test(text)
  );
}

function isUncertaintyContext(fragment: string) {
  const text = normalize(fragment);
  return /^(?:(?:minh|toi|i|we) )?(?:khong chac (?:co )?lien quan(?: khong)?|(?:am |are )?not sure (?:if|whether) (?:this|it) is related|reset type undecided)[.!?]*$/.test(resetChoiceContext(text)) ||
    /^(?:the )?(?:schema|scope|duration|cpu|ram|disk|lifetime)(?:\s*(?:,|and)\s*(?:schema|scope|duration|cpu|ram|disk|lifetime))*\s+(?:are|is|still)\s+(?:not specified|unknown|need sizing)[.!?]*$/.test(text) ||
    /^(?:(?:toi|minh|i|we) )?(?:chua (?:gui|cung cap|xac dinh)|have not (?:provided|sent|specified)) (?:query|execution plan|schema|space\/page|space|page|project|scope|duration|thoi han|transcript|diff)(?:\s+(?:hoac|va|or|and)\s+(?:query|execution plan|schema|space\/page|space|page|project|scope|duration|thoi han|transcript|diff))*[.!?]*$/.test(text);
}

function isExistingVpnLoginContext(previous: string, fragment: string) {
  const prior = normalize(previous);
  if (!/^(?:(?:toi|minh|i|we) )?(?:da co tai khoan vpn|already have (?:a |an )?vpn account)[.!]*$/.test(prior)) return false;
  const [symptom, ...help] = fragment.split(",");
  return /^(?:dang nhap (?:bi loi|that bai|khong duoc)|login (?:fails?|failed)|sign in (?:fails?|failed))[.!?]*$/.test(normalize(symptom)) &&
    help.every(isGuidanceFollowup);
}

const approvalContextOperations = /\b(?:please|need|want|grant|give|open|change|modify|configure|expose|allow|enable|close|disable|drop|delete|export|dump|wipe|mount|bypass|send|share|deploy|install|create|provision|reset|restart|run|connect|execute|add|turn|use|transfer|pay|migrate|can|dung|cai|chay|chuyen tien|gui)\b/;

function isApprovalContext(fragment: string, previous?: string) {
  const text = normalize(fragment);
  const scopeStart = text.search(/,\s*(?=(?:(?:minh|toi|i|we)\s+)?(?:chi can|only need|only|just|thiet bi la|dung laptop|using|from)\b)/);
  const claim = scopeStart < 0 ? text : text.slice(0, scopeStart);
  if (scopeStart >= 0 && (!previous || (
    !isGitScopeContinuation(previous, text.slice(scopeStart + 1)) &&
    !isCollaborationScopeContinuation(previous, text.slice(scopeStart + 1)) &&
    !isVpnScopeContinuation(previous, text.slice(scopeStart + 1)) &&
    !isVpnDeviceContext(previous, text.slice(scopeStart + 1))
  ))) return false;
  const beginsWithApprover =
    /^(?:(?:[a-z]+ ){0,3}(?:manager|director|lead)|(?:head|chief) of [a-z]+(?: [a-z]+)?|general counsel|truong phong|producer|(?:anh|chi) [a-z]{2,20}\s*,?\s*(?:engineering )?manager)\b/.test(
      claim,
    );
  const claimsApproval = /\b(?:approve|approved|approving|duyet|phe duyet)\b/.test(
    claim,
  );
  const containsSeparateOperation = asserted(
    claim.replace(/\bdung den (?:het thu (?:hai|ba|tu|nam|sau|bay)|cuoi sprint|cuoi tuan|ngay mai)\b/g, "timeframe"),
    approvalContextOperations,
  );
  const hasIndependentConjunct = claim
    .split(/\b(?:and|va|but|nhung)\b/)
    .slice(1)
    .some((clause) =>
      !/^(?:no|not|without|khong|only|just|chi)\b/.test(clause.trim()),
    );
  return (
    beginsWithApprover &&
    claimsApproval &&
    !containsSeparateOperation &&
    !hasIndependentConjunct
  );
}

function isApprovalReferenceContext(fragment: string) {
  const text = normalize(fragment);
  const reference = text.split(",", 1)[0]?.trim() ?? "";
  const remainder = text.slice(reference.length).trim();
  const containsSeparateOperation = asserted(
    text,
    approvalContextOperations,
  );
  const hasIndependentConjunct = text
    .split(/\b(?:and|va|but|nhung)\b/)
    .slice(1)
    .some((clause) =>
      !/^(?:no|not|without|khong|only|just|chi)\b/.test(clause.trim()),
    );
  return (
    /^(?:(?:manager|lead|team lead|producer) )?approval(?: reference| ticket| id)?(?:\s*[:=]\s*|\s+(?:is|nam o|o|in|at)\s+)[a-z][a-z0-9 ]{1,60}[.!]?$/.test(reference) &&
    /\b[a-z][a-z0-9]{1,12} \d{2,10}\b/.test(reference) &&
    (!remainder || /^,?\s*(?:thoi han|duration|timeframe|valid until|expires|ends|until|dung den|no|not|without|khong|only|just|chi)\b[^.!?]{0,100}$/.test(remainder)) &&
    !containsSeparateOperation &&
    !hasIndependentConjunct
  );
}

export function detectedRisks(raw: string): RiskSignal[] {
  const normalized = resetChoiceContext(normalize(raw));
  const text = documentationOnlyDatabaseReference(normalized)
    ? normalized.replace(/\b(?:production|prod)\s+(?:database|db)\b/g, "documentation reference")
    : normalized;
  const risks = new Set<RiskSignal>();
  if (
    asserted(text,
      /chuyen.{0,20}admin|pass.{0,15}admin|human (?:(?:support|helpdesk) )?(?:agent|reviewer)|khong hieu.{0,30}(?:ho tro|giup)/,
    )
  )
    risks.add("USER_HANDOFF");
  const selfService =
    /(?:reset|quen|forgot|doi|change)\s+(?:my |own |mat khau|password)|password reset/.test(
      text,
    );
  // A Vault storage statement alone is not evidence that a credential was exposed.
  const credentialExposure = asserted(
    text,
    /\b(?:paste|send|share|give|upload|post|publish|expose|reveal|disclose|print|log|show|include|forward|attach|email|gui|cung cap)\b.{0,35}\bcredentials?\b|\bcredentials?\b.{0,35}\b(?:paste|send|share|give|upload|post|publish|expose|reveal|disclose|print|log|show|include|forward|attach|email|gui|cung cap)\b|\bcho\b.{0,12}\bcredentials?\b|\bcredentials?\b.{0,12}\bcho\b/,
  );
  const statedCredentialValue = asserted(
    text,
    /\bcredentials?\s*(?:(?:[:=]\s*)|(?:\b(?:is|are|was|were)\s+))(?!stored\b|kept\b|saved\b|managed\b|redacted\b|masked\b)[a-z0-9][a-z0-9+/=_-]{7,}\b/,
  );
  if (
    /\[redacted/.test(text) ||
    asserted(
      text,
      /private key|kubeconfig|vault token|api key|secret|bearer/,
    ) ||
    credentialExposure ||
    statedCredentialValue ||
    (!selfService && asserted(text, /password|mat khau|\btoken\b/)) ||
    asserted(
      text,
      /(?:send|share|give|gui|cho|cung cap).{0,35}(?:password|mat khau|token|secret)/,
    )
  )
    risks.add("SECRET");
  // Exposure must be an asserted operation on a resource in the same clause.
  const clauses = text
    .replace(
      /\bpublic\s+(?:github|gitlab|docs?|documentation|tai lieu|open source)\b/g,
      "reference documentation",
    )
    // A port list is one scope, not independent actions separated by "and".
    .replace(/\b(?:ports?|cong)(?: dich| nguon)?\s*[:=]?\s*\d+(?:\s*(?:,|\/|and|va)\s*\d+)+/g,
      value => value.replace(/\b(?:and|va)\b/g, ","))
    .split(/[;\n]|\b(?:but|nhung|however|and|va)\b/);
  if (
    clauses.some(
      (clause) =>
        asserted(
          clause,
          /\bpublic(?:ly)?\b|\binternet\b|0\.0\.0\.0(?:\/0)?|\b0\/0\b|allow all|ra ngoai/,
        ) &&
        /\b(?:ports?|inbound|rdp|vnc|ssh|expose|exposed|exposure|accessible|internet facing|remote|bucket|service|server|database|db|postgresql|postgres|mysql|public ip)\b|\bcong(?: dich| nguon)?\s*[:=]?\s*[-+\d]|(?:open|mo)\s+\d+/.test(
          clause,
        ),
    )
  )
    risks.add("PUBLIC_EXPOSURE");
  if (
    asserted(
      text,
      /(?:(?:disable|turn off|stop|remove|deactivate|tat|dung|bo|vo hieu hoa)\s+(?:(?:the|agent|security|control|kiem soat|bao mat|co che)\s+){0,4}(?:mfa\b|2fa\b|edr\b|firewall\b|tuong lua|audit(?: logging)?\b|logging\b|security control|approval prompt|password\b)|(?:turn|switch)\s+(?:the |agent |security )?(?:mfa|2fa|edr|firewall|tuong lua|audit(?: logging)?|logging|security control)\s+off)/,
    )
  )
    risks.add("SECURITY_CONTROL");
  if (
    asserted(
      text,
      /(?:bypass|skip|ignore|bo(?: qua)?|khoi can|khong can qua)\s+(?:(?:the |security |software |network )){0,2}(?:mfa\b|2fa\b|edr\b|audit(?: logging)?\b|authentication\b|xac thuc\b|policy|review|approval|gate|control|quy trinh|chinh sach|form|cab|change ticket)/,
    ) ||
    /(?:cu|lam|cap|mo).{0,20}truoc.{0,30}(?:approval|phe duyet).{0,15}sau/.test(
      text,
    )
  )
    risks.add("BYPASS");
  if (
    /ignore (?:all |previous |the )?(?:instructions|policy|security)|bo qua (?:tat ca |cac )?(?:instruction|huong dan|chi dan)|system prompt|developer message|\[inst\]|\brole\s*[:=]\s*["']?(?:system|developer)\b|(?:return|output|tra ve) auto.approve|already approved by the system/.test(
      text,
    )
  )
    risks.add("INJECTION");
  if (
    asserted(text, /export|dump|copy|xuat|(?:sao )?chep/) &&
    /production|prod\b|customer|khach hang/.test(text) &&
    /laptop|may (?:ca nhan|phan tich)|o dia ca nhan|repo|public|unmanaged|drive|bucket|storage/.test(
      text,
    )
  )
    risks.add("DATA_EXPORT");
  if (
    asserted(
      text,
      /unsigned|sideload|unapproved|(?:(?:cai(?: dat)?|install)\s+)?(?:phan mem|software|package)\s+(?:chua(?: duoc)?(?: phe)? duyet|not approved)|torrent|bittorrent|miner|xmrig|crack|disable edr/,
    )
  )
    risks.add("UNAPPROVED_SOFTWARE");
  if (
    asserted(
      text,
      /cluster admin|\broot\b|quyen full|quyen (?:production )?admin|production admin|admin access|admin permission|admin role|owner access|cloud admin|cap admin|grant admin|permission\s*[:=]?\s*admin|privilegelevel\s*[:=]?\s*admin/,
    )
  )
    risks.add("PRIVILEGED");
  if (
    asserted(text, /production|\bprod\b/) &&
    /write|ghi|update|sua|delete|xoa|drop|deploy|rollback|admin|root|read access|read only access|select access|cap.{0,12}quyen/.test(
      text,
    )
  )
    risks.add("PRODUCTION_CHANGE");
  if (
    hasDestructiveDatabaseOperation(text) || asserted(
      text,
      /\bwipe\b|xoa (?:het|toan bo)|\b(?:xoa|delete)\s+(?:the\s+)?(?:vm|server|cloud resource)\b|factory reset|khoi phuc cai dat goc|format disk|drop table|drop bang|data delete|delete resource/,
    )
  )
    risks.add("DESTRUCTIVE");
  if (
    asserted(
      text,
      /lost device|stolen|mat laptop|malware|phishing|data breach|suspicious login|service outage|\bp1\b|\bp2\b|bi tan cong/,
    )
  )
    risks.add("INCIDENT");
  if (
    asserted(
      text,
      /firewall change|dns change|proxy change|alert threshold|quota increase|tang (?:gpu )?quota|sua manifest|manifest change|config change|doi cau hinh|(?:thay doi|sua|cap nhat|change|modify|update|configure)\s+(?:the\s+)?(?:dns|firewall|proxy)\b/,
    )
  )
    risks.add("CONTROL_CHANGE");
  return [...risks];
}

function environmentOf(text: string): Environment {
  if (documentationOnlyDatabaseReference(text)) return "unknown";
  if (asserted(text, /production|\bprod\b/)) return "production";
  if (/\bstaging\b|\buat\b|\bqa\b/.test(text)) return "staging";
  if (/\bsandbox\b/.test(text)) return "sandbox";
  if (/\bdev\b|development/.test(text)) return "development";
  return "unknown";
}

function isConceptExplanation(text: string) {
  const question = text.replace(/^(?:can|could|would) you (?:please )?/, "")
    .replace(/^ban (?:co the )?/, "");
  return /^(?:(?:hay|vui long|please) )?(?:giai thich|dinh nghia|explain|define|what (?:is|are)|.{2,60} la gi\b)/.test(question) &&
    !/\b(?:grant|give|open|close|enable|disable|deploy|delete|drop|export|dump|change|modify|configure|create|provision|restart|reset|install|bypass|need|want|request|connect|execute|run|cap|mo|tat|xoa|doi|sua|tao|cai|can|xin|chay|yeu cau|trien khai|thay doi|cau hinh|khoi dong)\b/.test(question);
}

// Both UI labels describe the same read-only help only for a vetted guide.
// This does not equate access/configuration requests, intents or supplied facts.
function equivalentGuidanceKinds(first: RequestKind, second: RequestKind, intent: string) {
  return [first, second].every((kind) => ["GUIDANCE", "SAFE_DIAGNOSTIC"].includes(kind)) &&
    guidanceRules.some((rule) => rule.labels.some((label) => label === intent));
}

function isRepeatedSafeSymptom(previous: string, fragment: string) {
  // A complete, unqualified restatement during clarification adds no new target
  // or operation. Named profiles/devices and appended instructions remain asks.
  const symptoms: Partial<Record<string, RegExp>> = {
    VPN_NOT_CONNECTING: /^vpn\s+(?:(?:bi|van|dang|lien tuc|thuong xuyen|keeps|is|still)\s+)*(?:ngat ket noi|khong ket noi|disconnecting|disconnected|connection drops|not connecting)(?:\s+(?:lien tuc|thuong xuyen|hoai|again|repeatedly|continuously))*[.!?]*$/,
    DEVICE_PRINTER: /^(?:may in|printer)\s+(?:(?:bi|van|dang|bao|is|still)\s+)*(?:ket giay|khong in|jammed|not printing|offline)[.!?]*$/,
  };
  const before = extractText(previous);
  const pattern = symptoms[before.intentLabel];
  if (!pattern?.test(normalize(fragment))) return false;
  const after = extractText(fragment);
  return before.intentLabel === after.intentLabel && before.serviceGroup === after.serviceGroup &&
    before.requestKind === "SAFE_DIAGNOSTIC" && after.requestKind === "SAFE_DIAGNOSTIC" &&
    before.riskSignals.length === 0 && after.riskSignals.length === 0;
}

function isBoundedFallbackContext(fragment: string) {
  const text = normalize(fragment);
  const helpOnly = /^(?:(?:toi|minh) (?:can|nen) (?:kiem tra|bat dau) (?:tu dau|gi truoc)|ban huong dan(?: giup toi)? duoc khong|(?:huong dan|chi) (?:toi|minh) (?:kiem tra|xu ly)(?: an toan)?|what should i check first|where should i start|please guide me through safe checks|(?:(?:hay|vui long) )?giai thich(?: ngan gon| ro hon)?|please explain(?: briefly)?)[?.!]*$/;
  const unchangedControl = /^(?:(?:toi|minh|i|we) )?(?:khong|khong duoc|do not|don't|never) (?:tat|bo qua|thay doi|doi|disable|bypass|turn off|change|modify) (?:mfa|2fa|edr|firewall|tuong lua|dns|proxy|cau hinh|audit|logging)[.!]*$/;
  const noNewAccess = /^(?:(?:toi|minh|i|we) )?(?:khong (?:can|xin|yeu cau)|do not (?:need|request)|no) (?:quyen(?: truy cap)?|access|permissions?)(?: (?:github|gitlab|jira|confluence))?[.!]*$/;
  return helpOnly.test(text) || isGuidanceFollowup(fragment) || unchangedControl.test(text) || noNewAccess.test(text) ||
    isNegatedDeviceChangeRefusal(fragment);
}

// A complete request for checks adds no resource, authority or side effect.
// Anchoring is essential: appended access/execute requests remain separate.
function isGuidanceFollowup(fragment: string) {
  return /^(?:(?:toi|minh) (?:can|nen) (?:kiem tra|bat dau) (?:tu dau|gi truoc)|ban huong dan(?: giup toi)? duoc khong|(?:huong dan|chi) (?:toi|minh) (?:kiem tra|xu ly)(?: an toan)?|(?:(?:hay|vui long) )?giai thich(?: chi tiet cach kiem tra| tung buoc)|what should i check(?: first)?|where should i start|what safe checks can i do|what is the safe recovery process|(?:please )?(?:guide me through safe checks|help me (?:troubleshoot(?: it)?(?: safely)?|diagnose)|help troubleshoot|i need troubleshooting steps)|how can i diagnose the connection|(?:(?:hay|vui long) )?(?:huong dan|chi buoc) (?:kiem tra|xu ly)(?: an toan| ban dau| co ban)?|(?:toi|minh) muon huong dan kiem tra an toan)[?.!]*$/.test(normalize(fragment));
}

/** An outage may use a vetted guide only when server-visible facts establish
 * a bounded help task. A model label alone is not sufficient evidence. */
export function safeDeterministicGuidance(input: SupportInput, baseline: CanonicalRequest) {
  if (baseline.riskSignals.length || baseline.redactions.length ||
      baseline.ambiguities.length || baseline.subrequests.length ||
      !["GUIDANCE", "SAFE_DIAGNOSTIC"].includes(baseline.requestKind) ||
      !["guidance", "diagnose", "restart", "answer"].includes(baseline.requestedAction)) return false;
  const publicTopic = Object.keys(input.fields).some(key => !isEmployeeIdentityField(key)) ? null : faqTopic(input.rawText);
  if (publicTopic && faqIntents[publicTopic] === baseline.intentLabel) return true;
  const publicContext = Object.keys(input.fields).some(key => !isEmployeeIdentityField(key)) ? null : guidanceCacheContext(input.rawText);
  if (publicContext?.intent === baseline.intentLabel) return true;
  const text = normalize(input.rawText);
  // An unrecognized comma/colon continuation may be a second task. During an
  // outage, require the complete clause to be known context, not just a keyword.
  const clauses = input.rawText.split(/[,:]/).map((part) => part.trim());
  if (clauses.slice(1).some((part) => !isBoundedFallbackContext(part) &&
      !isRepeatedSafeSymptom(clauses[0], part))) return false;
  const allContext = normalize([input.rawText, ...Object.values(input.fields)].join("; ")
    .split(/[;,:\n]|\.\s+/).filter((part) => !isNegatedDeviceChangeRefusal(part)).join("; "));
  // Commas/colons can join a symptom to a separate request for access, an ID or
  // resources. Do not silently answer only the symptom during an AI outage.
  if (asserted(allContext,
    /\b(?:grant|give|add|allow|need|want|request|increase|provision|allocate|create|cap|cho|can|muon|xin|them|tang|tao|yeu cau|cung cap)\b[^.!?;]{0,50}\b(?:permissions?|access|roles?|quota|capacity|resources?|accounts?|id|quyen|truy cap|tai khoan|tai nguyen|gpu|vcpu|ram|disk|storage|cloud|sandbox|budget|ngan sach|repo|repository|github|gitlab|jira|confluence|database|schema)\b/,
  )) return false;
  // Decline active changes even when the broad symptom classifier found a
  // printer/VPN noun first. Local negations cannot cancel a later instruction.
  if (asserted(allContext,
    /\b(?:install|uninstall|update|upgrade|firmware|driver|drivers|deploy|execute|run|script|command|sudo|powershell|terminal|regedit|registry|chmod|grant|provision|export|dump|wipe|format|delete|erase|factory reset|cai dat|cai lai|nang cap|cap nhat|chay lenh|thuc thi|cap quyen|xoa|khoi phuc cai dat goc)\b|\b(?:change|modify|configure|open|close|enable|disable|mo|tat|sua|doi|thay doi|cau hinh)\s+(?:the\s+)?(?:port|cong|firewall|tuong lua|dns|proxy|vpn|mfa|edr|profile|cau hinh)\b/,
  )) return false;
  const knownGuide = guidanceRules.some((rule) => rule.labels.some((label) => label === baseline.intentLabel));
  if (!text) return input.mode === "structured" && knownGuide && input.fields.intentLabel === baseline.intentLabel;
  if (isConceptExplanation(text)) return true;
  if (!knownGuide) return false;
  if (baseline.intentLabel === "DEVICE_RESTART_GUIDANCE" || baseline.intentLabel === "DEVICE_SHUTDOWN_GUIDANCE") {
    return asserted(text, /\b(?:restart|reboot|khoi dong lai|shutdown|shut down|tat may|power off)\b/) &&
      !/\b(?:server|service|pod|cluster|workload|database)\b/.test(text);
  }
  const symptomPatterns: Partial<Record<string, RegExp>> = {
    DEVICE_PRINTER: /\b(?:printer|may in)\b.{0,60}\b(?:ket giay|loi|error|jam|jammed|not print|khong in|offline|khong hoat dong)\b/,
    VPN_NOT_CONNECTING: /\bvpn\b.{0,60}\b(?:ngat ket noi|khong ket noi|not connect|disconnect|disconnecting|disconnected|connection drops|loi|error|fail|timeout|timed out)\b/,
    VPN_LOGIN: /\bvpn\b.{0,60}\b(?:authentication failed|sai mat khau|dang nhap that bai)\b/,
    WIFI_NOT_WORKING: /\b(?:wifi|wi fi)\b.{0,60}\b(?:khong ket noi|khong hoat dong|not work|not working|not connect|loi|error|disconnect|disconnecting)\b/,
    DEVICE_FREEZE: /\b(?:may|laptop|computer|device)\b.{0,60}\b(?:bi treo|bi do|freeze|frozen|hangs|not responding|sap nguon|mat nguon)\b/,
    DEVICE_WONT_BOOT: /\b(?:may|laptop|computer|device)\b.{0,60}\b(?:khong bat|khong khoi dong|won.t boot|won.t start|boot loop)\b/,
  };
  return symptomPatterns[baseline.intentLabel]?.test(text) ?? false;
}

function classifyFallback(text: string): [ServiceGroup, string, RequestKind] {
  text = resetChoiceContext(text);
  // A technical noun in a definition question is not a request to change it.
  // Full-input risk and independent-subrequest checks still run afterwards.
  if (isConceptExplanation(text)) return ["OTHER", "GENERAL_HOW_TO", "GUIDANCE"];
  if (
    /chuyen.{0,20}admin|pass.{0,15}admin|human (?:(?:support|helpdesk) )?(?:agent|reviewer)|khong hieu/.test(
      text,
    )
  )
    return ["OTHER", "REQUEST_CLASSIFICATION_HELP", "OTHER"];
  if (
    /vpn/.test(text) &&
    /loi|fail|not connect|khong ket noi|ngat ket noi|disconnect|connection drops|troubleshoot|setup|cai dat|dang nhap/.test(
      text,
    )
  )
    return ["NETWORK_VPN", "VPN_NOT_CONNECTING", "SAFE_DIAGNOSTIC"];
  if (/wifi|wi fi|mang khong|mat ket noi mang|network unreachable/.test(text))
    return ["NETWORK_VPN", "WIFI_NOT_WORKING", "SAFE_DIAGNOSTIC"];
  if (/sap nguon|mat nguon|tu tat may|sudden power loss/.test(text))
    return ["DEVICE_BOOT", "DEVICE_FREEZE", "SAFE_DIAGNOSTIC"];
  if (asserted(text, /factory reset|khoi phuc cai dat goc/))
    return ["DEVICE_BOOT", "DEVICE_FACTORY_RESET", "CONFIGURATION_CHANGE"];
  if (asserted(text, /\bwipe\b|xoa toan bo (?:may|thiet bi)/))
    return ["DEVICE_BOOT", "DEVICE_WIPE", "CONFIGURATION_CHANGE"];
  // A Jira/Confluence resource can mention ports or databases without asking
  // to change those systems. Explicit system operations still take precedence.
  if (collaborationDocumentAccess(text))
    return ["ACCOUNT_ACCESS", "REQUEST_STANDARD_ACCESS", "ACCESS_REQUEST"];
  // A managed VPN profile request is access provisioning, not a port change.
  if (standardVpnAccess(text))
    return ["NETWORK_VPN", "VPN_SETUP", "ACCESS_REQUEST"];
  if (databaseProvisioningRequest(text))
    return ["DATABASE", "DATABASE_PROVISION", "ROUTINE_WORKFLOW"];
  if (computeProvisioningRequest(text))
    return ["CLOUD_GPU", "CLOUD_VM_REQUEST", "ROUTINE_WORKFLOW"];
  if (/shutdown|shut down|tat may|power off/.test(text))
    return ["DEVICE_BOOT", "DEVICE_SHUTDOWN_GUIDANCE", "GUIDANCE"];
  if (
    /restart|reboot|khoi dong lai/.test(text) &&
    !/pod|cluster|server|service|workload/.test(text)
  )
    return ["DEVICE_BOOT", "DEVICE_RESTART_GUIDANCE", "GUIDANCE"];
  if (/reset/.test(text) && /may|computer|laptop|device/.test(text))
    return ["DEVICE_BOOT", "DEVICE_RESET_GUIDANCE", "GUIDANCE"];
  if (/freeze|frozen|bi treo|bi do|hangs|not responding/.test(text))
    return ["DEVICE_BOOT", "DEVICE_FREEZE", "SAFE_DIAGNOSTIC"];
  if (/won.t boot|won.t start|khong (?:bat|khoi dong)|boot loop/.test(text))
    return ["DEVICE_BOOT", "DEVICE_WONT_BOOT", "SAFE_DIAGNOSTIC"];
  if (/printer|may in/.test(text))
    return ["DEVICE_BOOT", "DEVICE_PRINTER", "SAFE_DIAGNOSTIC"];
  if (/\b(?:audio|am thanh|microphone|loa)\b/.test(text))
    return ["DEVICE_BOOT", "DEVICE_AUDIO", "SAFE_DIAGNOSTIC"];
  if (/\b(?:display|monitor|man hinh)\b/.test(text))
    return ["DEVICE_BOOT", "DEVICE_DISPLAY", "SAFE_DIAGNOSTIC"];
  if (
    /password reset|reset.{0,10}(?:password|mat khau)|quen mat khau|forgot.{0,10}password/.test(
      text,
    )
  )
    return ["ACCOUNT_ACCESS", "PASSWORD_RESET", "GUIDANCE"];
  if (
    (/mfa|sso|account locked|login|dang nhap/.test(text) ||
      (/tai khoan|\bacc\b|\baccount\b/.test(text) &&
        /khong.{0,45}(?:vao|truy cap)|(?:cannot|can't|unable to).{0,25}(?:access|sign in|log in)/.test(text))) &&
    !/disable|tat |cap quyen/.test(text)
  )
    return ["ACCOUNT_ACCESS", "ACCOUNT_LOGIN", "SAFE_DIAGNOSTIC"];
  if (/phishing|malware|security incident|data breach/.test(text))
    return ["SECURITY", "SECURITY_INCIDENT", "INCIDENT"];
  if (asserted(text, /\b(?:ports?|firewall|rdp|dns|public ip|vpn|proxy)\b|\bcong\s+(?:(?:dich|nguon)\s+)?\d/))
    return ["NETWORK_VPN", "PORT_OPEN_REQUEST", "CONFIGURATION_CHANGE"];
  if (/github|gitlab|\bgit\b|repository|\brepo\b/.test(text))
    return ["GIT_PERMISSION", "GIT_READ_ACCESS", "ACCESS_REQUEST"];
  if (
    /database|\bdb\b|mysql|postgres|redis|mongodb|clickhouse|sql/.test(text)
  ) {
    if (
      /query help|cach viet.{0,15}(?:query|sql)|how to write.{0,15}query/.test(
        text,
      )
    )
      return ["DATABASE", "DATABASE_QUERY_HELP", "GUIDANCE"];
    if (
      /\b(?:export|dump|copy data|xuat du lieu|sao chep du lieu)\b/.test(text)
    )
      return ["DATABASE", "DATABASE_EXPORT", "CONFIGURATION_CHANGE"];
    return [
      "DATABASE",
      /write|ghi|update|ddl/.test(text)
        ? "DATABASE_WRITE_ACCESS"
        : "DATABASE_READ_ACCESS",
      "ACCESS_REQUEST",
    ];
  }
  if (
    /gpu|a100|h100|t4|sandbox|vcpu|etl|airflow|server|cloud|\bvm\b/.test(text)
  )
    return [
      "CLOUD_GPU",
      /gpu|a100|h100|t4/.test(text) ? "GPU_REQUEST" : "CLOUD_SANDBOX",
      "ROUTINE_WORKFLOW",
    ];
  if (/kubernetes|\bk8s\b|kubectl|namespace|\bpod\b/.test(text))
    return ["KUBERNETES", "K8S_VIEW_LOGS", "ROUTINE_WORKFLOW"];
  if (/pipeline|ci\/cd|deployment/.test(text))
    return ["CI_CD", "PIPELINE_FAILED", "SAFE_DIAGNOSTIC"];
  if (/monitoring|metrics|grafana|alert/.test(text))
    return ["MONITORING", "MONITORING_VIEW_LOGS", "SAFE_DIAGNOSTIC"];
  if (/software|phan mem|license|ung dung|application/.test(text))
    return [
      "SOFTWARE_LICENSE",
      /cach|how|use|su dung/.test(text)
        ? "APPROVED_CATALOG_LOOKUP"
        : "SOFTWARE_INSTALL",
      /cach|how|use|su dung/.test(text) ? "GUIDANCE" : "ROUTINE_WORKFLOW",
    ];
  if (/backup|restore|storage|bucket|file share/.test(text))
    return ["STORAGE", /restore/.test(text) ? "RESTORE_REQUEST" : "BACKUP_REQUEST", "ROUTINE_WORKFLOW"];
  if (/access|quyen|permission|admin|jira|confluence/.test(text))
    return ["ACCOUNT_ACCESS", "REQUEST_STANDARD_ACCESS", "ACCESS_REQUEST"];
  if (/how to|lam sao|huong dan|cach su dung/.test(text))
    return ["OTHER", "GENERAL_HOW_TO", "GUIDANCE"];
  return ["OTHER", "UNKNOWN_SUPPORT_REQUEST", "OTHER"];
}

// Specific symptom/subject pairs compete by specificity before broad catalog hints.
// Mentions of an unaffected system are not requests to change that system.
function classify(text: string): [ServiceGroup, string, RequestKind] {
  const topic = faqTopic(text);
  if (topic) return [topic.startsWith("printer:") ? "DEVICE_BOOT" : "NETWORK_VPN", faqIntents[topic], "SAFE_DIAGNOSTIC"];
  const context = guidanceCacheContext(text);
  if (context) return [context.topic.startsWith("printer:") ? "DEVICE_BOOT" : "NETWORK_VPN", context.intent, "SAFE_DIAGNOSTIC"];
  const relevant = text.replace(
    /\b(?:vpn|wi fi|wifi|mfa)\s+(?:is working|works fine|van binh thuong|binh thuong|khong bi loi|van vao web duoc)\b/g,
    " ",
  );
  // A symptom cannot route an explicitly requested destructive DB operation
  // to laptop guidance. The existing authority/destructive rules still decide.
  if (hasDestructiveDatabaseOperation(relevant))
    return ["DATABASE", "DATABASE_SCHEMA_CHANGE", "CONFIGURATION_CHANGE"];
  const candidates: Array<{
    score: number;
    group: ServiceGroup;
    label: string;
    pattern: RegExp;
  }> = [
    {
      score: 4,
      group: "ACCOUNT_ACCESS",
      label: "MFA_FAILURE",
      pattern:
        /\bmfa\b.{0,25}(?:fail|error|khong|loi)|(?:loi|error|failed).{0,12}\bmfa\b/,
    },
    {
      score: 3,
      group: "NETWORK_VPN",
      label: "VPN_LOGIN",
      pattern:
        /\bvpn\b.{0,30}(?:authentication failed|sai mat khau|dang nhap that bai)/,
    },
    {
      score: 2,
      group: "NETWORK_VPN",
      label: "VPN_NOT_CONNECTING",
      pattern:
        /\bvpn\b.{0,30}(?:not connect|khong ket noi|ngat ket noi|disconnect|connection drops|loi|fail|timeout|timed out)|(?:loi|khong ket noi|cannot connect to).{0,15}\bvpn\b/,
    },
    {
      score: 2,
      group: "NETWORK_VPN",
      label: "WIFI_NOT_WORKING",
      pattern:
        /\b(?:wi fi|wifi)\b.{0,30}(?:not work|not connect|khong|loi)|(?:khong ket noi|cannot connect to).{0,15}\b(?:wi fi|wifi)\b/,
    },
    {
      score: 2,
      group: "DEVICE_BOOT",
      label: "DEVICE_PRINTER",
      pattern:
        /(?:printer|may in).{0,30}(?:loi|error|not print|khong in|ket giay)/,
    },
    {
      score: 2,
      group: "DATABASE",
      label: "DATABASE_CONNECTION",
      pattern:
        /(?:postgresql|postgres|mysql|database).{0,30}(?:connection failed|connection refused|khong ket noi|loi ket noi)|(?:loi ket noi|cannot connect to).{0,15}(?:postgresql|postgres|mysql|database)/,
    },
    { score: 3, group: "DEVICE_BOOT", label: "DEVICE_SLOW",
      pattern: /\b(?:laptop|computer|may tinh)\b.{0,40}\b(?:chay cham|slow|sluggish)\b/ },
    { score: 3, group: "DEVICE_BOOT", label: "DEVICE_CRASH",
      pattern: /\b(?:laptop|computer|may tinh)\b.{0,40}\bcrash(?:es|ing)?\b/ },
    { score: 3, group: "DEVICE_BOOT", label: "DEVICE_BATTERY",
      pattern: /\b(?:pin|battery)\b.{0,40}\b(?:tut nhanh|drains?|het nhanh)\b/ },
    { score: 3, group: "DEVICE_BOOT", label: "DEVICE_CAMERA",
      pattern: /\bcamera\b.{0,40}\b(?:khong len hinh|khong hoat dong|not work|no image)\b/ },
    { score: 3, group: "SOFTWARE_LICENSE", label: "SOFTWARE_CRASH",
      pattern: /\b(?:software|application|phan mem|ung dung)\b.{0,50}\bcrash(?:es|ing)?\b/ },
    { score: 3, group: "SOFTWARE_LICENSE", label: "SOFTWARE_PERFORMANCE",
      pattern: /\b(?:software|application|phan mem|ung dung)\b.{0,50}\b(?:chay cham|slow|sluggish)\b/ },
    { score: 3, group: "SOFTWARE_LICENSE", label: "LICENSE_ACTIVATION",
      pattern: /\b(?:phan mem|software|license)\b.{0,50}\b(?:loi kich hoat|activation (?:error|fail))\b/ },
  ];
  const matches = candidates.filter((candidate) =>
    candidate.pattern.test(relevant),
  );
  if (matches.length) {
    const best = Math.max(...matches.map((candidate) => candidate.score)),
      winners = matches.filter((candidate) => candidate.score === best);
    if (winners.length === 1)
      return [winners[0].group, winners[0].label, "SAFE_DIAGNOSTIC"];
    // Ambiguous simultaneous symptoms require clarification/classification; never infer authority.
    return ["OTHER", "CROSS_FUNCTION_REQUEST", "OTHER"];
  }
  return classifyFallback(relevant);
}

export function extractText(rawText: string): Extraction {
  const text = normalize(rawText);
  const [serviceGroup, intentLabel, requestKind] = classify(text);
  const riskSignals = detectedRisks(rawText);
  const entities: Record<string, string> = {};
  const network = serviceGroup === "NETWORK_VPN"
    ? extractNetworkFacts(rawText, (quote, index) => {
        const literal = normalize(quote).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return asserted(normalize(rawText.slice(0, index + quote.length)), new RegExp(`${literal}$`));
      })
    : { entities: {}, evidence: [], missingFields: [], ambiguities: [], conflict: false };
  Object.assign(entities, network.entities);
  if (network.conflict) riskSignals.push("CONFLICT");
  const system = text.match(
    /\b(mysql|postgresql|postgres|redis|mongodb|clickhouse|jira|confluence|github|gitlab)\b/,
  );
  if (system) entities.system = system[1];
  const permission = statedPermission(text);
  if (
    permission &&
    (requestKind === "ACCESS_REQUEST" || riskSignals.includes("PRIVILEGED"))
  )
    entities.permission = permission;
  const duration = statedDuration(rawText);
  if (duration) entities.duration = duration;
  if (serviceGroup === "CLOUD_GPU") {
    const classification = statedDataClassification(text);
    if (classification) entities.dataSensitivity = classification;
  }
  const environment = environmentOf(text);
  if (environment !== "unknown") entities.environment = environment;
  // Preserve the whole bounded reference; a suffix must never resolve to a
  // different registry record. Verification still checks exact scope and TTL.
  const approvalReference = rawText.match(/(?<![A-Za-z0-9_-])[A-Z][A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12}){0,3}-\d{2,10}(?![A-Za-z0-9_-])/);
  if (approvalReference) entities.approvalReference = approvalReference[0];
  if (/approved|approve|da duyet|phe duyet/.test(text))
    entities.approvalStatus = "claimed";
  for (const [key, pattern] of Object.entries({
    cpu: /(\d+)\s*vcpu/,
    ram: /(\d+)\s*gb\s*ram/,
    disk: /(?:disk\s*)(\d+)\s*gb|(\d+)\s*gb\s*disk\b/,
    quantity: /(\d+)\s*(?:x\s*)?(?:(?:shared|dedicated)\s+)?(?:gpu|a100|h100|t4)\b/,
  })) {
    const match = text.match(pattern);
    if (match) entities[key] = match[1] || match[2];
  }
  // Preserve stated resource paths and purposes; do not invent a provider,
  // deadline or verified authority from a routine-looking request.
  if (serviceGroup === "GIT_PERMISSION") {
    const provider = text.match(/\b(github|gitlab)\b/);
    if (provider) entities.provider = provider[1];
    const repository = rawText.match(/\b(?:repo|repository)\s+([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+){1,5})(?=\s|[,;.!?]|$)/i);
    if (repository) entities.repository = repository[1].replace(/\.+$/, "");
  }
  if (["GIT_PERMISSION", "CLOUD_GPU", "ACCOUNT_ACCESS", "DATABASE"].includes(serviceGroup) ||
      (intentLabel === "VPN_SETUP" && requestKind === "ACCESS_REQUEST")) {
    const purpose = rawText.match(/\s(?:để|de|cho mục đích|cho muc dich)\s+([^;.\n,]{1,250})/i) ||
      rawText.match(/\s(?:to|for)\s+((?:test|support|review|replay|benchmark|render|backfill|sync|train|open|follow|update)\b[^;.\n,]{0,240})/i) ||
      rawText.match(/,\s*(?:cần|can|need to)\s+((?:follow|review|update|theo dõi|theo doi|cập nhật|cap nhat)\b[^;.\n,]{8,240})/i);
    if (purpose) entities[serviceGroup === "CLOUD_GPU" ? "purpose" : "reason"] = purpose[1].trim();
  }
  if (standardVpnAccess(text)) {
    entities.service = "VPN";
    const source = rawText.match(/\b(?:managed|company|corporate) laptop\b|\blaptop (?:managed|corporate|công ty|cong ty)\b/i);
    const target = rawText.match(/\b(?:qa|dev|development) (?:subnet|network)\b/i);
    if (source) entities.source = source[0];
    if (target) entities.target = target[0];
  }
  // Explicit labelled facts are extracted without an LLM; preserve original resource spelling.
  for (const [key, label] of Object.entries(factLabels)) {
    if (serviceGroup === "NETWORK_VPN" && ["source", "target"].includes(key)) continue;
    const match = rawText.match(
      new RegExp(`(?:^|[;\\n,]|\\s)(?:${label})\\s*[:=]\\s*([^;\\n,]+)`, "i"),
    );
    if (match) {
      const literal = match[1].trim();
      const value = key === "duration" ? statedDuration(`duration ${literal}`) ?? literal : literal;
      // A label must not erase a contrary fact stated earlier in the input.
      if (entities[key] && normalizeFact(entities[key]) !== normalizeFact(value)) riskSignals.push("CONFLICT");
      else entities[key] = value;
    }
  }
  if (serviceGroup === "ACCOUNT_ACCESS") {
    if (entities.system && !entities.targetSystem)
      entities.targetSystem = entities.system;
    if (entities.permission) entities.accessType = entities.permission;
    const scope = rawText.match(/\b(?:jira (?:project|board)|confluence space)\s+([A-Za-z0-9_-]+)/i);
    const page = rawText.match(/\bconfluence page\s+([^;.,\n]{1,120})/i);
    if (!entities.resourceScope && scope) entities.resourceScope = scope[1];
    if (!entities.resourceScope && page)
      entities.resourceScope = page[1].split(/\s(?:để|de|for|cho mục đích|cho muc dich|with|với|voi)\s/i)[0].trim();
  }
  for (const mapping of permissionMappings) {
    if (mapping.serviceGroup !== serviceGroup ||
        (mapping.system && mapping.system !== entities.system) ||
        !asserted(text, mapping.pattern)) continue;
    const previous = entities[mapping.field];
    if (mapping.value === "standard" && ["developer-assigned", "agent-assigned"].includes(previous)) continue;
    if (previous && previous !== mapping.value) riskSignals.push("CONFLICT");
    else entities[mapping.field] = mapping.value;
  }
  const gpu = text.match(/\b(a100|h100|t4|a10)\b/);
  if (gpu) entities.gpuType = gpu[1];
  const semanticAction =
    intentLabel === "DATABASE_EXPORT"
      ? "export"
      : intentLabel === "DEVICE_WIPE"
        ? "wipe"
        : intentLabel === "DEVICE_FACTORY_RESET"
          ? "factory reset"
          : intentLabel === "PORT_OPEN_REQUEST"
            ? "change"
            : requestKind === "GUIDANCE"
              ? "guidance"
              : requestKind === "SAFE_DIAGNOSTIC"
                ? "diagnose"
                : requestKind === "ACCESS_REQUEST"
                  ? "access"
                  : "request";
  return {
    language: /[ăâđêôơưáàạảãéèẹẻẽíìịỉĩóòọỏõúùụủũýỳỵỷỹ]/i.test(rawText)
      ? /\b(access|help|production|read|write|vpn|reset|admin)\b/i.test(rawText)
        ? "mixed"
        : "vi"
      : "en",
    requestKind,
    serviceGroup,
    intentLabel,
    entities,
    environment,
    requestedAction: semanticAction,
    riskSignals,
    missingFields: network.missingFields,
    evidence: [{ field: "input", quote: rawText || "Structured intake" }, ...network.evidence],
    ambiguities: network.ambiguities,
  };
}

export function safeInput(input: SupportInput): {
  input: SupportInput;
  markers: string[];
} {
  const raw = redact(input.rawText);
  const markers = new Set(raw.markers);
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.fields)) {
    const safe = redact(value);
    fields[key] = safe.text;
    safe.markers.forEach((marker) => markers.add(marker));
  }
  return {
    input: { ...input, rawText: raw.text, fields },
    markers: [...markers],
  };
}

export function extractIntake(
  input: SupportInput,
  redactions: string[] = [],
): CanonicalRequest {
  const extracted = extractText(input.rawText);
  const fields = Object.fromEntries(
    Object.entries(input.fields).filter(
      ([, value]) =>
        value.trim() && !["unknown", "Unknown", "not_provided"].includes(value),
    ),
  );
  const risks = new Set(extracted.riskSignals);
  // Selected service is a routing hint, not a risk override. Explicit facts are checked independently.
  for (const key of [
    "environment",
    "permission",
    "system",
    "duration",
    "provider",
    "accessType",
    "requestedAction",
    "operation",
    "dataSensitivity",
    "resourceLifecycle",
    "port",
    "protocol",
    "source",
    "target",
  ]) {
    if (
      fields[key] &&
      extracted.entities[key] &&
      // A bounded answer can resolve an unresolved relative deadline. A
      // contrary concrete interval still raises CONFLICT; no TTL is inferred.
      !(key === "duration" && relativeDuration.test(normalize(extracted.entities[key]))) &&
      (["port", "protocol", "source", "target"].includes(key)
        ? !sameNetworkFact(key, fields[key], extracted.entities[key])
        : normalizeFact(fields[key]) !== normalizeFact(extracted.entities[key]))
    )
      risks.add("CONFLICT");
  }
  const selectedIntent = fields.intentLabel;
  if (
    selectedIntent &&
    extracted.intentLabel !== "UNKNOWN_SUPPORT_REQUEST" &&
    input.rawText &&
    selectedIntent !== extracted.intentLabel &&
    !(selectedIntent === "DEVICE_RESET_GUIDANCE" &&
      extracted.intentLabel === "DEVICE_RESTART_GUIDANCE" &&
      fields.resetType === "restart")
  )
    risks.add("CONFLICT");
  if (
    input.mode === "structured" &&
    input.rawText &&
    input.serviceGroup !== "OTHER" &&
    extracted.serviceGroup !== "OTHER" &&
    input.serviceGroup !== extracted.serviceGroup
  )
    risks.add("CONFLICT");
  if (
    input.requestKind &&
    input.requestKind !== "OTHER" &&
    input.rawText &&
    extracted.requestKind !== "OTHER" &&
    input.requestKind !== extracted.requestKind &&
    !equivalentGuidanceKinds(input.requestKind, extracted.requestKind, extracted.intentLabel)
  )
    risks.add("CONFLICT");
  let serviceGroup = extracted.serviceGroup;
  let intentLabel = extracted.intentLabel;
  if (!input.rawText || extracted.intentLabel === "UNKNOWN_SUPPORT_REQUEST") {
    serviceGroup = input.serviceGroup;
    if (selectedIntent && validIntent(serviceGroup, selectedIntent))
      intentLabel = selectedIntent;
  }
  if (intentLabel === "DEVICE_RESET_GUIDANCE" && fields.resetType === "restart")
    intentLabel = "DEVICE_RESTART_GUIDANCE";
  if (
    intentLabel === "DEVICE_RESET_GUIDANCE" &&
    fields.resetType === "factory_reset"
  ) {
    intentLabel = "DEVICE_FACTORY_RESET";
    risks.add("DESTRUCTIVE");
  }
  const entities = { ...extracted.entities, ...fields };
  const missingFields = [...extracted.missingFields];
  const ambiguities = [...extracted.ambiguities];
  // A form field cannot silently replace conflicting prose, select one member
  // of a range/list, or make an invalid port look complete at the hazard gate.
  if (serviceGroup === "NETWORK_VPN") {
    for (const key of ["port", "protocol", "source", "target"]) {
      const invalid = key === "port" ? fields[key] && !isSingleNetworkPort(fields[key])
        : key === "protocol" ? fields[key] && !isSingleNetworkProtocol(fields[key]) : false;
      const mismatch = fields[key] && extracted.entities[key] &&
        !sameNetworkFact(key, fields[key], extracted.entities[key]);
      const unresolvedScope = extracted.ambiguities.some(value => value.startsWith(`${key}:`));
      if (invalid || mismatch || unresolvedScope) {
        delete entities[key];
        if (!missingFields.includes(key)) missingFields.push(key);
        if (fields[key]) {
          ambiguities.push(`${key}: giá trị trong biểu mẫu cần được đối chiếu với nội dung yêu cầu.`);
          if (mismatch || unresolvedScope) risks.add("CONFLICT");
        }
      } else if (entities[key]) {
        const index = missingFields.indexOf(key);
        if (index >= 0) missingFields.splice(index, 1);
      }
    }
  }
  const env = fields.environment as Environment | undefined;
  const environment = env ?? extracted.environment;
  let requestedAction =
    fields.requestedAction || fields.operation || extracted.requestedAction;
  let requestKind = input.requestKind ?? extracted.requestKind;
  if (selectedIntent && !input.rawText) {
    if (/GUIDANCE|HELP|LOOKUP|PASSWORD_RESET/.test(selectedIntent))
      requestKind = "GUIDANCE";
    else if (selectedIntent === "VPN_SETUP" && input.requestKind === "ACCESS_REQUEST")
      requestKind = "ACCESS_REQUEST";
    else if (selectedIntent === "DATABASE_PROVISION" && fields.operation === "provision")
      requestKind = "CONFIGURATION_CHANGE";
    else if (
      /FREEZE|WONT_BOOT|SLOW|CRASH|VPN_|WIFI_|LOGIN|LOCKED|MFA_|SSO_|DISPLAY|AUDIO|PRINTER|CAMERA|FAILED/.test(
        selectedIntent,
      )
    )
      requestKind = "SAFE_DIAGNOSTIC";
    else if (/ACCESS|PERMISSION|MEMBERSHIP|ROLE|ACCOUNT/.test(selectedIntent))
      requestKind = "ACCESS_REQUEST";
    else if (
      /INCIDENT|OUTAGE|MALWARE|PHISHING|LOST|STOLEN/.test(selectedIntent)
    )
      requestKind = "INCIDENT";
    else
      requestKind =
        selectedIntent === "UNKNOWN_SUPPORT_REQUEST"
          ? "OTHER"
          : "ROUTINE_WORKFLOW";
    if (
      input.requestKind &&
      input.requestKind !== "OTHER" &&
      input.requestKind !== requestKind &&
      !equivalentGuidanceKinds(input.requestKind, requestKind, intentLabel)
    )
      risks.add("CONFLICT");
    if (!fields.requestedAction && !fields.operation)
      requestedAction =
        requestKind === "GUIDANCE"
          ? "guidance"
          : requestKind === "SAFE_DIAGNOSTIC"
            ? "diagnose"
            : "request";
  }
  if (
    ["wipe", "delete", "deploy", "change", "replace"].includes(
      requestedAction,
    ) ||
    (fields.operation && !["query_help", "read"].includes(fields.operation))
  )
    requestKind = "CONFIGURATION_CHANGE";
  if (
    /ACCESS|PERMISSION/.test(intentLabel) &&
    fields.operation &&
    !["read", "write"].includes(fields.operation)
  )
    risks.add("CONFLICT");
  detectedRisks(
    Object.entries(fields)
      .map(([key, value]) => `${key}=${value}`)
      .join("; "),
  ).forEach((risk) => risks.add(risk));
  if (
    [entities.permission, entities.accessType, entities.privilegeLevel].some(
      (value) =>
        /^(admin|root|owner|maintain|cluster-admin)$/.test(value ?? ""),
    )
  )
    risks.add("PRIVILEGED");
  if (["publicIp", "publicExposure"].some((key) => fields[key] === "yes"))
    risks.add("PUBLIC_EXPOSURE");
  if (
    ["containsSecret", "secretAccess", "secretChange"].some(
      (key) => fields[key] === "yes",
    ) ||
    redactions.length
  )
    risks.add("SECRET");
  if (
    environment === "production" &&
    ((requestKind === "ACCESS_REQUEST" &&
      (serviceGroup !== "DATABASE" ||
        !["read", "read-only"].includes(entities.permission ?? ""))) ||
      requestKind === "CONFIGURATION_CHANGE" ||
      (["DATABASE", "CLOUD_GPU", "KUBERNETES", "CI_CD"].includes(
        serviceGroup,
      ) &&
        requestKind === "ROUTINE_WORKFLOW"))
  )
    risks.add("PRODUCTION_CHANGE");
  if (
    /WIPE|FACTORY_RESET|RESOURCE_DELETE|DATA_DELETE|DEVICE_REPLACEMENT/.test(
      intentLabel,
    ) ||
    /^(wipe|delete|replace|factory reset)$/.test(requestedAction)
  )
    risks.add("DESTRUCTIVE");
  if (/ADMIN|ROOT/.test(intentLabel)) risks.add("PRIVILEGED");
  if (/SECRET|CREDENTIAL/.test(intentLabel)) risks.add("SECRET");
  if (/PUBLIC_EXPOSURE|PUBLIC_IP|REMOTE_ACCESS/.test(intentLabel))
    risks.add("PUBLIC_EXPOSURE");
  if (/MFA_DISABLE|EDR_DISABLE|BYPASS_APPROVAL/.test(intentLabel))
    risks.add("SECURITY_CONTROL");
  if (/UNSIGNED|UNAPPROVED/.test(intentLabel)) risks.add("UNAPPROVED_SOFTWARE");
  if (
    /DNS_CHANGE|FIREWALL_CHANGE|PROXY_CONFIG|CONFIG_CHANGE|MANIFEST_CHANGE|INGRESS_CHANGE|ALERT_THRESHOLD|ALERT_ROUTING|GPU_QUOTA|CLOUD_BUDGET|K8S_EXEC_POD|K8S_DEPLOY|K8S_RESTART_POD|K8S_SCALE_WORKLOAD|K8S_ROLLBACK|RESOURCE_SCALE|STAGING_DEPLOY|PRODUCTION_DEPLOY|PRODUCTION_ROLLBACK/.test(
      intentLabel,
    )
  )
    risks.add("CONTROL_CHANGE");
  if (fields.configChange === "yes") risks.add("CONTROL_CHANGE");
  if (
    requestKind === "INCIDENT" ||
    (serviceGroup === "SECURITY" && intentLabel !== "COMPLIANCE_QUESTION")
  )
    risks.add("INCIDENT");
  if (
    /DATA_EXPORT|DATABASE_EXPORT/.test(intentLabel) &&
    (fields.productionData === "yes" ||
      ["customer", "confidential"].includes(fields.dataSensitivity ?? "") ||
      environment === "production")
  )
    risks.add("DATA_EXPORT");
  const parts = input.rawText
    // "but still" describes the same symptom; risks are already evaluated on the full original text.
    .replace(/\b(?:nhưng|nhung|but)\s+(?:vẫn|van)\b/gi, "vẫn")
    // In this conditional, "then" connects the same provisioning request.
    .replace(/\b(if possible)\s+then\s+(?=provision\b)/gi, "$1 ")
    // Two explicitly requested collaboration resources have independent scope
    // and approval checks; do not inherit one target's approval onto the other.
    .replace(/(\b(?:access|quyền|quyen)\s+(?:(?:to|vào|vao)\s+)?(?:jira project|confluence space)\s+[A-Za-z0-9_-]+)\s+(?:and|và|va)\s+(?=(?:jira project|confluence space)\b)/gi, "$1; ")
    .split(
      /(?:\n|;|\.\s+|\b(?:nhưng|nhung|but|tiện thể|tien the|ngoài ra|ngoai ra|and also|and then|then|đồng thời|dong thoi|cùng lúc|cung luc)\b|\band\s+(?=(?:grant|give|open|disable|turn|deploy|delete|restart|create|cap|mo|tat|xuat|trien khai)\b)|(?<!\b(?:select|read)\s+)\band\s+(?=export\b))/i,
    )
    .map((part) => part.trim())
    .filter(Boolean)
    // A complete courtesy is not an extra task. Keep the original input and
    // its risk/evidence checks; never discard a clause with appended content.
    .filter((part) => !/^(?:thanks(?: team)?|thank you(?: team)?|cam on(?: team| ban)?)[.!]*$/.test(normalize(part)))
    // A complete statement that another service works is context, not a
    // requested port/configuration change. Appended actions never match this.
    .filter((part) => !/^(?:vpn|wi fi|wifi|mfa)\s+(?:van on|van binh thuong|binh thuong|hoat dong binh thuong|khong bi loi|is working|works fine|is working normally|is fine|is okay|is ok)[.!]*$/.test(normalize(part)))
    // A standalone refusal to bypass a control is context for the actual task,
    // not a second requested operation.
    .filter((part) => !isNegatedControlRefusal(part))
    .filter((part) => !isNegatedDeviceChangeRefusal(part))
    .reduce<string[]>((requests, fragment) => {
      const label = fragment.match(/^([^:=]+)[:=]/)?.[1];
      // Labelled facts describe the preceding request, not an independent task.
      // Risk detection still evaluates the full original input and every value.
      const factLabel =
        label &&
        [...allFields, ...Object.values(factLabels).flatMap((value) => value.split("|")),
          ...Object.values(networkFactLabels).flatMap((value) => value.split("|"))]
          .some((field) => normalize(field) === normalize(label));
      // These complete, bounded questions add no operation or scope. Do not
      // discard arbitrary unknown fragments, or extra actions hidden in prose.
      const guidanceFollowup = isGuidanceFollowup(fragment);
      // Approval claims add provenance, not a task or verified authority.
      const previous = requests.at(-1);
      const approvalContext = isApprovalContext(fragment, previous);
      const approvalReferenceContext = isApprovalReferenceContext(fragment);
      const scopeConstraint = isScopeConstraint(fragment);
      const resourceContinuation =
        previous && isResourceProvisioningContinuation(previous, fragment);
      const collaborationScope =
        previous && isCollaborationScopeContinuation(previous, fragment);
      const gitScope = previous && isGitScopeContinuation(previous, fragment);
      const vpnDevice = previous && isVpnDeviceContext(previous, fragment);
      const databaseAuthorization = previous && isDatabaseAuthorizationContext(previous, fragment);
      const uncertaintyContext = isUncertaintyContext(fragment);
      const repeatedSymptom = previous && isRepeatedSafeSymptom(previous, fragment);
      const existingVpnLogin = previous && isExistingVpnLoginContext(previous, fragment);
      if (
        requests.length &&
        (factLabel ||
          guidanceFollowup ||
          approvalContext ||
          approvalReferenceContext ||
          scopeConstraint ||
          resourceContinuation ||
          collaborationScope ||
          gitScope ||
          vpnDevice ||
          databaseAuthorization ||
          isDurationOnlyContext(fragment) ||
          repeatedSymptom ||
          existingVpnLogin ||
          uncertaintyContext)
      )
        requests[requests.length - 1] += `; ${fragment}`;
      else requests.push(fragment);
      return requests;
    }, []);
  // The closed FAQ parser consumes the full input, including polite follow-up
  // phrasing; those phrases are not independent requests. Unknown text still splits.
  let subrequests = parts.length > 1 && !faqTopic(input.rawText) && !guidanceCacheContext(input.rawText) ? parts.map(extractText) : [];
  if (
    extracted.intentLabel === "DEVICE_RESTART_GUIDANCE" &&
    /(?:khong|not)\s+factory reset/.test(normalize(input.rawText))
  )
    subrequests = subrequests.filter(
      (part) => part.intentLabel !== "DEVICE_RESET_GUIDANCE",
    );
  // A reset question followed by an explicit, harmless restart clarification
  // describes one intent. Full-input risks/fact conflicts remain authoritative.
  if (
    extracted.intentLabel === "DEVICE_RESTART_GUIDANCE" &&
    subrequests.length > 1 &&
    subrequests.every((part) =>
      ["DEVICE_RESET_GUIDANCE", "DEVICE_RESTART_GUIDANCE"].includes(part.intentLabel) &&
      part.riskSignals.length === 0)
  ) subrequests = [];
  // Clarification history can produce one parsed fragment that repeats the
  // resolved primary intent. Treat it as the same request, not a second ask.
  if (
    subrequests.length === 1 &&
    subrequests[0].intentLabel === extracted.intentLabel &&
    subrequests[0].serviceGroup === extracted.serviceGroup &&
    subrequests[0].requestKind === extracted.requestKind &&
    subrequests[0].requestedAction === extracted.requestedAction &&
    [
      "targetSystem", "system", "provider", "repository", "resourceScope",
      "cluster", "namespace", "workload", "service", "source", "target",
      "port", "protocol", "permission", "accessType", "operation",
    ].every((field) =>
      normalizeFact(subrequests[0].entities[field] ?? "") ===
      normalizeFact(extracted.entities[field] ?? ""),
    ) &&
    subrequests[0].riskSignals.length === 0
  ) subrequests = [];
  if (
    subrequests.length > 1 &&
    Object.keys(fields).some((field) => !isEmployeeIdentityField(field))
  )
    risks.add("CONFLICT");
  subrequests.forEach((part) =>
    part.riskSignals.forEach((risk) => risks.add(risk)),
  );
  const evidence = input.rawText ? extracted.evidence : [];
  for (const [field, value] of Object.entries(fields))
    evidence.push({ field, quote: `${field}=${value}` });
  return {
    ...extracted,
    serviceGroup,
    intentLabel,
    requestKind,
    entities,
    missingFields,
    ambiguities,
    environment,
    requestedAction,
    riskSignals: [...risks],
    evidence,
    subrequests,
    redactions,
    model: { source: "deterministic" },
  };
}

export function teamFor(group: ServiceGroup) {
  return catalog[group].team;
}
