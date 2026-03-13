/**
 * URL validation utility for SSRF prevention.
 * Validates URLs before server-side fetches to block requests to internal networks.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^169\.254\./, // link-local
  /^0\./, // 0.0.0.0/8
];

const BLOCKED_HOSTNAMES = ["localhost", "[::1]"];

export function validateMediaUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname;

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: `Blocked host: ${hostname}` };
  }

  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, error: `Blocked private IP: ${hostname}` };
    }
  }

  return { valid: true };
}
