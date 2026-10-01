/**
 * Neon connection strings from the Connect dialog include `-pooler` and
 * `channel_binding=require`. The pooler rejects multi-statement migrations,
 * and node-postgres fails the channel-binding flag on some hosts.
 */
export function normalizeDatabaseUrl(raw, { direct = false } = {}) {
  const value = raw?.trim();
  if (!value) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (direct) url.hostname = url.hostname.replace("-pooler", "");
  if (url.searchParams.get("channel_binding") === "require") {
    url.searchParams.delete("channel_binding");
  }
  return url.toString();
}
