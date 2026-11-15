// The one host-name guard every outgoing request from a connection passes
// (integrationClient.ts re-exports it): https to a public host, no
// credentials in the URL, no names or address literals that spell a
// private target. A module of its own, with no imports, so the OAuth
// modules (customOAuth.ts) can use it without importing the client.
// Pure, so web/tests imports it.

/** Pure. True when a URL is safe to call from the server: https to a public host. */
export function isSafeEndpoint(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  // A trailing dot names the same host ("localhost." is localhost).
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (!host.includes(".") && !host.includes(":")) return false;
  // IPv4 literals in private, loopback, link-local, CGNAT and metadata ranges.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224) return false;
  }
  // IPv6 literals are refused outright: loopback, unique/site/link-local,
  // IPv4-mapped / -compatible / NAT64 forms all spell private targets, and
  // no real integration endpoint is an IPv6 literal.
  if (host.includes(":")) return false;
  return true;
}
