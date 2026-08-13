import { and, eq } from "drizzle-orm";
import { vocabularyWords } from "../../../../db/schema";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { ensureUser } from "../../../../lib/data/users";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentUser();
  if (!current) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const db = await ensureUser(current);
  const removed = await db.delete(vocabularyWords).where(and(eq(vocabularyWords.id, id), eq(vocabularyWords.userId, current.id))).returning({ id: vocabularyWords.id });
  if (!removed.length) return Response.json({ error: "Word not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}
