import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "./current-user";

export async function requireGoogleUser(returnTo: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireAdmin(returnTo: string) {
  const user = await requireGoogleUser(returnTo);
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !allowed.includes(user.email.toLowerCase())) notFound();
  return user;
}
