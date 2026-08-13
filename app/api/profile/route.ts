import { and, desc, eq, gte, sql } from "drizzle-orm";
import { correctionEvents, users, vocabularyWords } from "../../../db/schema";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { ensureUser } from "../../../lib/data/users";

const languages = new Set(["English", "Polish", "Spanish", "German", "French", "Ukrainian"]);

export async function GET() {
  const current = await getCurrentUser();
  if (!current) return Response.json({ error: "Authentication required." }, { status: 401 });
  const db = await ensureUser(current);
  const since = new Date(Date.now() - 34 * 86_400_000);
  const topicSince = new Date(Date.now() - 30 * 86_400_000);

  const [profile] = await db.select().from(users).where(eq(users.id, current.id)).limit(1);
  const [summary] = await db.select({
    sentences: sql<number>`count(*)::int`,
    averageScore: sql<number>`coalesce(round(avg(${correctionEvents.score})), 0)::int`,
  }).from(correctionEvents).where(eq(correctionEvents.userId, current.id));
  const [wordSummary] = await db.select({
    words: sql<number>`count(*)::int`,
    remembered: sql<number>`count(*) filter (where ${vocabularyWords.reviewCount} > 0)::int`,
    due: sql<number>`count(*) filter (where ${vocabularyWords.nextReviewAt} <= now())::int`,
  }).from(vocabularyWords).where(eq(vocabularyWords.userId, current.id));
  const events = await db.select({
    score: correctionEvents.score,
    categories: correctionEvents.categoriesJson,
    createdAt: correctionEvents.createdAt,
  }).from(correctionEvents).where(and(eq(correctionEvents.userId, current.id), gte(correctionEvents.createdAt, since))).orderBy(desc(correctionEvents.createdAt));

  const categories = new Map<string, number>();
  const activity = new Map<string, number>();
  for (const event of events) {
    const day = event.createdAt.toISOString().slice(0, 10);
    activity.set(day, (activity.get(day) ?? 0) + 1);
    if (event.createdAt >= topicSince) {
      for (const [category, count] of Object.entries(event.categories)) categories.set(category, (categories.get(category) ?? 0) + count);
    }
  }

  return Response.json({
    profile: {
      name: profile.displayName ?? current.displayName ?? current.email ?? "Fluent learner",
      email: profile.email ?? current.email,
      dialect: profile.dialect,
      explanationLanguage: profile.explanationLanguage,
      translationLanguage: profile.translationLanguage,
      storeSentences: profile.storeSentences,
    },
    stats: {
      sentences: summary.sentences,
      averageScore: summary.averageScore,
      words: wordSummary.words,
      remembered: wordSummary.remembered,
      due: wordSummary.due,
      streak: calculateStreak(events.map((event) => event.createdAt)),
    },
    topics: [...categories.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    activity: [...activity.entries()].map(([date, count]) => ({ date, count })),
  });
}

export async function PUT(request: Request) {
  const current = await getCurrentUser();
  if (!current) return Response.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });

  const dialect = body.dialect === "en-GB" ? "en-GB" : "en-US";
  const explanationLanguage = languages.has(String(body.explanationLanguage)) ? String(body.explanationLanguage) : "English";
  const translationLanguage = languages.has(String(body.translationLanguage)) ? String(body.translationLanguage) : "English";
  const storeSentences = body.storeSentences === true;
  const db = await ensureUser(current);
  await db.update(users).set({ dialect, explanationLanguage, translationLanguage, storeSentences, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(users.id, current.id));
  return Response.json({ profile: { name: current.displayName ?? current.email ?? "Fluent learner", email: current.email, dialect, explanationLanguage, translationLanguage, storeSentences } });
}

function calculateStreak(dates: Date[]) {
  const days = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  const cursor = new Date();
  let streak = 0;
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) {
      if (streak === 0) { cursor.setUTCDate(cursor.getUTCDate() - 1); if (days.has(cursor.toISOString().slice(0, 10))) continue; }
      break;
    }
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
