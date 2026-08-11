import { auth } from "../../auth";

export type CurrentUser = {
  id: string;
  provider: "google";
  providerUserId: string;
  email: string | null;
  displayName: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const providerUserId = session?.user?.id;
  if (!providerUserId) return null;
  return {
    id: `google:${providerUserId}`,
    provider: "google",
    providerUserId,
    email: session.user.email ?? null,
    displayName: session.user.name ?? null,
  };
}

export async function safetyIdentifier(user: CurrentUser | null): Promise<string | undefined> {
  if (!user) return undefined;
  const bytes = new TextEncoder().encode(user.id);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  return `fluent_${hash.slice(0, 32)}`;
}
