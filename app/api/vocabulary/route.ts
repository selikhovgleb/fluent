import { desc, eq } from "drizzle-orm";
import { vocabularyWords } from "../../../db/schema";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { ensureUser } from "../../../lib/data/users";

export async function GET() {
  const current = await getCurrentUser();
  if (!current) return Response.json({ error: "Authentication required." }, { status: 401 });
  const db = await ensureUser(current);
  const words = await db.select().from(vocabularyWords).where(eq(vocabularyWords.userId, current.id)).orderBy(desc(vocabularyWords.createdAt));
  return Response.json({ words });
}

export async function POST(request: Request) {
  const current = await getCurrentUser();
  if (!current) return Response.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const word = clean(body?.word, 100);
  const translation = clean(body?.translation, 300);
  if (!word || !translation) return Response.json({ error: "Word and translation are required." }, { status: 400 });
  const db = await ensureUser(current);
  const entry = {
    id: crypto.randomUUID(), userId: current.id, word, translation,
    definition: clean(body?.definition, 500), partOfSpeech: clean(body?.partOfSpeech, 80),
    pronunciation: clean(body?.pronunciation, 100), cefrLevel: validLevel(body?.level),
    example: clean(body?.example, 500), targetLanguage: clean(body?.targetLanguage, 40) || "English",
  };
  await db.insert(vocabularyWords).values(entry);
  return Response.json({ word: { ...entry, intervalDays: 1, easeFactor: 2.5, reviewCount: 0, nextReviewAt: new Date().toISOString() } }, { status: 201 });
}

function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validLevel(value: unknown) { return ["A1", "A2", "B1", "B2", "C1", "C2"].includes(String(value)) ? String(value) : "B1"; }
