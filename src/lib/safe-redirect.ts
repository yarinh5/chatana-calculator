const INVITE_PREFIX = "/workspace/join/";

export function safeInviteRedirect(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith(INVITE_PREFIX)) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    if (!parsed.pathname.startsWith(INVITE_PREFIX)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function authFallbackPath(isAdmin?: boolean) {
  return isAdmin ? "/admin" : "/dashboard";
}

export function redirectParam(path: string | null) {
  return path ? `?redirect=${encodeURIComponent(path)}` : "";
}
