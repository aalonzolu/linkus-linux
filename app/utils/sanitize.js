// Small helpers to keep PII and secrets out of logs.

const SENSITIVE_KEY_RE = /(password|token|secret|authorization|cookie|apikey|api_key|session)/i;

function maskTel(value) {
  if (typeof value !== 'string') return value;
  // Redact the dialed number but keep the tel: marker for debugging.
  return value.replace(/^tel:.*/i, 'tel:<redacted>');
}

function sanitizeArgv(argv) {
  if (!Array.isArray(argv)) return argv;
  return argv.map(maskTel);
}

function sanitizeUrl(url) {
  if (typeof url !== 'string' || !url) return url;
  try {
    const u = new URL(url);
    // Drop query/hash which can contain tokens; keep origin + path.
    return `${u.origin}${u.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

function sanitizeObject(obj, depth = 0) {
  if (obj == null || typeof obj !== 'object' || depth > 4) return obj;
  if (Array.isArray(obj)) return obj.map((v) => sanitizeObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '<redacted>';
    } else if (typeof v === 'object') {
      out[k] = sanitizeObject(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = { maskTel, sanitizeArgv, sanitizeUrl, sanitizeObject };
