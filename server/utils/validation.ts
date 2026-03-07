/**
 * Input validation utilities for request data.
 */

/** Returns trimmed string if val is a non-empty string within maxLen, null otherwise. */
export function validateString(val: unknown, maxLen: number): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  return trimmed;
}

/** Validates val is a string that parses as a URL and is within maxLen (default 2048).
 *  Also accepts internal virtual feed identifiers (e.g. '__youtube__'). */
export function validateUrl(val: unknown, maxLen: number = 2048): string | null {
  const s = validateString(val, maxLen);
  if (!s) return null;
  // Allow internal virtual feed identifiers
  if (s.startsWith('__') && s.endsWith('__')) return s;
  try {
    new URL(s);
    return s;
  } catch {
    return null;
  }
}

/** Returns the array if val is an array with length <= maxLen, null otherwise. */
export function validateArray(val: unknown, maxLen: number): unknown[] | null {
  if (!Array.isArray(val)) return null;
  if (val.length > maxLen) return null;
  return val;
}
