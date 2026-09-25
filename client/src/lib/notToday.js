// A joke, not a security control — this app has no database or eval, so
// there's nothing here for a real injection to actually hit. It's just a
// "not today" gag for the classic Bobby Tables-style inputs.
const NAUGHTY_PATTERNS = [
  /drop\s+table/i,
  /drop\s+database/i,
  /delete\s+from/i,
  /truncate\s+table/i,
  /insert\s+into/i,
  /union\s+select/i,
  /;\s*--/,
  /\bor\b\s*'?1'?\s*=\s*'?1/i,
  /<script/i,
  /\$\{.*\}/,
  /\{\{.*\}\}/,
  /^null$/i,
  /^undefined$/i,
  /^nan$/i,
];

export function isNotToday(text) {
  const value = String(text ?? '').trim();
  if (!value) return false;
  return NAUGHTY_PATTERNS.some((pattern) => pattern.test(value));
}
