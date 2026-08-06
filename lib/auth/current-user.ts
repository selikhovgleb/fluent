export type CurrentUser = {
  id: string;
  provider: "sites";
  providerUserId: string;
  email: string | null;
  displayName: string | null;
};

// Temporary adapter for the private Sites deployment. Replace this adapter with
// Google OAuth once the platform external-OAuth path and credentials are ready.
export function getCurrentUser(request: Request): CurrentUser | null {
  const providerUserId = request.headers.get("oai-authenticated-user-id");
  if (!providerUserId) return null;
  return {
    id: `sites:${providerUserId}`,
    provider: "sites",
    providerUserId,
    email: request.headers.get("oai-authenticated-user-email"),
    displayName: decodeName(request.headers),
  };
}

function decodeName(headers: Headers): string | null {
  if (headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return null;
  const value = headers.get("oai-authenticated-user-full-name");
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return null; }
}

export async function safetyIdentifier(user: CurrentUser | null): Promise<string | undefined> {
  if (!user) return undefined;
  const bytes = new TextEncoder().encode(user.id);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  return `fluent_${hash.slice(0, 32)}`;
}
