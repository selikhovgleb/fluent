import type { ReactNode } from "react";
import { requireGoogleUser } from "../../lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function ProfileLayout({ children }: { children: ReactNode }) {
  await requireGoogleUser("/profile");
  return children;
}
