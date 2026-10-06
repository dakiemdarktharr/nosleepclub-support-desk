// Redact before extraction, persistence, audit and response. Never retain the original secret.
export function redact(text: string): { text: string; markers: string[] } {
  const markers = new Set<string>();
  // Match the same Unicode forms that extraction understands, before any boundary.
  let safe = text.normalize("NFKC").replace(/[\u200B-\u200F\u2060\uFEFF]/g, "");
  const replace = (pattern: RegExp, marker: string, replacement: string) => {
    safe = safe.replace(pattern, () => {
      markers.add(marker);
      return replacement;
    });
  };
  replace(
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|$)/gi,
    "PRIVATE_KEY",
    "[REDACTED_PRIVATE_KEY]",
  );
  replace(
    /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]+|(?:AKIA|ASIA)[A-Z0-9]{16})\b/g,
    "TOKEN",
    "[REDACTED_TOKEN]",
  );
  safe = safe.replace(
    /\b((?:aws_secret_access_key|aws_session_token|client_secret|access_token|refresh_token|private_key)\s*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
    (_, prefix: string) => {
      markers.add("SECRET_VALUE");
      return prefix + "[REDACTED]";
    },
  );
  safe = safe.replace(
    /((?:mã xác minh|ma xac minh|mã otp|ma otp|\botp|verification code|one[ -]time code)\s*["']?\s*(?::|=|là|la|is)?\s*["']?)[0-9](?:[ -]?[0-9]){3,9}(?![ -]*[0-9])/gi,
    (_, prefix: string) => {
      markers.add("VERIFICATION_CODE");
      return prefix + "[REDACTED_VERIFICATION_CODE]";
    },
  );
  replace(/\bBearer\s+[^\s,;]+/gi, "TOKEN", "Bearer [REDACTED_TOKEN]");
  replace(
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    "TOKEN",
    "[REDACTED_TOKEN]",
  );
  safe = safe.replace(
    /\b((?:aws[ _-]?(?:secret[ _-]?access[ _-]?key|access[ _-]?key[ _-]?id|session[ _-]?token)|secret[ _-]?access[ _-]?key|access[ _-]?key[ _-]?id|password|passwd|pwd|token|api[ _-]?key|secret|credential|mật khẩu|mat khau|private[ _-]?key)\s*["']?\s*(?:[:=]|\bis\b|là(?=\s))\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    (_, prefix: string) => {
      markers.add("SECRET_VALUE");
      return prefix + "[REDACTED]";
    },
  );
  // Tickets frequently paste `token VALUE` without `=` or `:`. Keep common
  // support phrases such as "password reset" intact, but redact value-like
  // material before it reaches extraction, persistence, audit or a model.
  safe = safe.replace(
    /\b((?:password|passwd|pwd|token|api[ _-]?key|secret|credential|mật khẩu|mat khau)\s+)(?!reset\b|change\b|setup\b|policy\b|field\b)([A-Za-z0-9_./+@-]{6,})\b/gi,
    (_, prefix: string) => {
      markers.add("SECRET_VALUE");
      return prefix + "[REDACTED]";
    },
  );
  safe = safe.replace(
    /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi,
    (_, protocol: string) => {
      markers.add("CONNECTION_CREDENTIAL");
      return protocol + "[REDACTED]@";
    },
  );
  // Only explicit labels and bounded formats: unlabeled numbers may be ticket
  // IDs/resources. These masks neither validate identity nor anonymize all PII.
  safe = safe.replace(
    /((?:\bCCCD|căn cước(?: công dân)?|can cuoc(?: cong dan)?)\s*["']?\s*(?:[:=]|là|la|is)?\s*["']?)[0-9](?:[ .-]?[0-9]){11}(?![ .-]*[0-9])/gi,
    (_, prefix: string) => {
      markers.add("LABELED_IDENTITY_NUMBER");
      return prefix + "[REDACTED_IDENTITY_NUMBER]";
    },
  );
  safe = safe.replace(
    /((?:số điện thoại|so dien thoai|\bsđt|\bsdt|\bphone(?: number)?|\bmobile(?: number)?)\s*(?:[:=]|là|la|is)?\s*)(?:0|\+84[ .-]?)[35789](?:[ .-]?[0-9]){8}(?![ .-]*[0-9])/gi,
    (_, prefix: string) => {
      markers.add("LABELED_PHONE_NUMBER");
      return prefix + "[REDACTED_PHONE_NUMBER]";
    },
  );
  replace(/\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+\b/gi,
    "EMAIL", "[REDACTED_EMAIL]");
  safe = safe.replace(
    /((?:employee[ _-]?id|mã nhân viên|ma nhan vien)\s*["']?\s*[:=]\s*["']?)[a-z0-9][a-z0-9_-]{2,63}\b/gi,
    (_, prefix: string) => {
      markers.add("LABELED_EMPLOYEE_ID");
      return prefix + "[REDACTED_EMPLOYEE_ID]";
    },
  );
  return { text: safe, markers: [...markers] };
}
