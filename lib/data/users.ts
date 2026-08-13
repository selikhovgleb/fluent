import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { users } from "../../db/schema";
import type { CurrentUser } from "../auth/current-user";

export async function ensureUser(user: CurrentUser) {
  const db = getDb();
  await db.insert(users).values({
    id: user.id,
    authProvider: user.provider,
    providerUserId: user.providerUserId,
    email: user.email,
    displayName: user.displayName,
  }).onConflictDoUpdate({
    target: users.id,
    set: {
      email: user.email,
      displayName: user.displayName,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    },
  });
  return db;
}
