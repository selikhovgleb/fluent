import { and, eq, sql } from "drizzle-orm";
import { vocabularyReviews, vocabularyWords } from "../../../../../db/schema";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { ensureUser } from "../../../../../lib/data/users";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser();
  if (!current) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const db = await ensureUser(current);
  const existing = await db.select().from(vocabularyWords).where(and(eq(vocabularyWords.id, id), eq(vocabularyWords.userId, current.id))).limit(1);
  if (!existing.length) return Response.json({ error: "Word not found." }, { status: 404 });
  const intervalDays = Math.min(60, Math.max(1, Math.round(existing[0].intervalDays * existing[0].easeFactor)));
  const nextReviewAt = new Date(Date.now() + intervalDays * 86_400_000);
  await db.transaction(async (tx) => {
    await tx.insert(vocabularyReviews).values({ id: crypto.randomUUID(), wordId: id, userId: current.id, result: "remembered" });
    await tx.update(vocabularyWords).set({ intervalDays, nextReviewAt, reviewCount: sql`${vocabularyWords.reviewCount} + 1`, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(vocabularyWords.id, id));
  });
  return Response.json({ intervalDays, nextReviewAt: nextReviewAt.toISOString() });
}
