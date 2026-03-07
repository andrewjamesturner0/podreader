import { lookup } from 'dns/promises';

/**
 * Validates that a URL is safe to fetch (not pointing to internal/private networks).
 * Prevents SSRF attacks by checking scheme, hostname, and resolved IP address.
 * Returns a resolved IP so callers can pin connections and avoid DNS rebinding.
 */

const PRIVATE_IP_RANGES = [
  // IPv4 private ranges (RFC 1918)
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  // Loopback
  /^127\./,
  // Link-local
  /^169\.254\./,
  // CGNAT
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
  // IPv6 mapped IPv4 loopback
  /^::1$/,
  /^::ffff:127\./,
  /^::ffff:10\./,
  /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./,
  /^::ffff:192\.168\./,
  /^::ffff:169\.254\./,
  // IPv6 private
  /^f[cd]/i,  // fc00::/7 unique local
  /^fe[89ab]/i,  // fe80::/10 link-local
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
];

function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(regex => regex.test(ip));
}

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  /** Resolved IP address — callers should connect to this to avoid DNS rebinding */
  resolvedIp?: string;
  /** Original hostname for the Host header */
  hostname?: string;
}

export async function validateUrl(url: string): Promise<UrlValidationResult> {
  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check scheme
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http and https URLs are allowed' };
  }

  // Check for blocked hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: 'URL hostname is not allowed' };
  }

  // Check if hostname is an IP literal
  const ipLiteralMatch = hostname.match(/^\[?([\d.:a-f]+)\]?$/i);
  if (ipLiteralMatch) {
    if (isPrivateIP(ipLiteralMatch[1])) {
      return { valid: false, error: 'URL resolves to a private/internal IP address' };
    }
    return { valid: true, resolvedIp: ipLiteralMatch[1], hostname };
  }

  // DNS resolution check — resolve ALL addresses and reject if any is private
  try {
    const results = await lookup(hostname, { all: true });
    for (const result of results) {
      if (isPrivateIP(result.address)) {
        return { valid: false, error: 'URL resolves to a private/internal IP address' };
      }
    }
    // Return the first resolved IP for callers to pin their connection
    return { valid: true, resolvedIp: results[0].address, hostname };
  } catch {
    return { valid: false, error: 'Could not resolve URL hostname' };
  }
}
