import { desc, lte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { correctionEvents, users, vocabularyWords } from "../../db/schema";

export type AdminDashboardData = {
  status: "connected" | "error";
  error: string | null;
  users: number;
  corrections: number;
  averageScore: number;
  storedSentences: number;
  words: number;
  dueWords: number;
  categories: Array<{ category: string; count: number }>;
  models: Array<{ model: string; promptVersion: string; count: number }>;
  recent: Array<{ id: string; user: string; score: number; mistakes: number; sentenceStored: boolean; model: string; promptVersion: string; createdAt: string }>;
};

export async function loadAdminDashboard(): Promise<AdminDashboardData> {
  try {
    const db = getDb();
    const [userRows, correctionRows, wordRows, dueWordRows, categoriesResult, modelRows, recentRows] = await Promise.all([
      db.select({ total: sql<number>`COUNT(*)::integer` }).from(users),
      db.select({
        total: sql<number>`COUNT(*)::integer`,
        averageScore: sql<number>`COALESCE(ROUND(AVG(${correctionEvents.score})), 0)::integer`,
        storedSentences: sql<number>`COUNT(${correctionEvents.originalText})::integer`,
      }).from(correctionEvents),
      db.select({ total: sql<number>`COUNT(*)::integer` }).from(vocabularyWords),
      db.select({ total: sql<number>`COUNT(*)::integer` }).from(vocabularyWords).where(lte(vocabularyWords.nextReviewAt, new Date())),
      db.execute<{ category: string; total: number }>(sql`
        SELECT category, SUM(value::integer)::integer AS total
        FROM correction_events
        CROSS JOIN LATERAL jsonb_each_text(categories_json) AS categories(category, value)
        GROUP BY category
        ORDER BY total DESC
        LIMIT 8
      `),
      db.select({
        model: correctionEvents.model,
        promptVersion: correctionEvents.promptVersion,
        total: sql<number>`COUNT(*)::integer`,
      }).from(correctionEvents).groupBy(correctionEvents.model, correctionEvents.promptVersion).orderBy(desc(sql`COUNT(*)`)),
      db.select({
        id: correctionEvents.id,
        user: sql<string>`COALESCE(${users.displayName}, ${users.email}, 'Anonymous')`,
        score: correctionEvents.score,
        mistakes: correctionEvents.mistakeCount,
        sentenceStored: sql<boolean>`${correctionEvents.originalText} IS NOT NULL`,
        model: correctionEvents.model,
        promptVersion: correctionEvents.promptVersion,
        createdAt: correctionEvents.createdAt,
      }).from(correctionEvents).leftJoin(users, sql`${users.id} = ${correctionEvents.userId}`).orderBy(desc(correctionEvents.createdAt)).limit(12),
    ]);

    return {
      status: "connected",
      error: null,
      users: numberValue(userRows[0]?.total),
      corrections: numberValue(correctionRows[0]?.total),
      averageScore: numberValue(correctionRows[0]?.averageScore),
      storedSentences: numberValue(correctionRows[0]?.storedSentences),
      words: numberValue(wordRows[0]?.total),
      dueWords: numberValue(dueWordRows[0]?.total),
      categories: categoriesResult.rows.map((row) => ({ category: row.category, count: numberValue(row.total) })),
      models: modelRows.map((row) => ({ model: row.model, promptVersion: row.promptVersion, count: numberValue(row.total) })),
      recent: recentRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    return emptyDashboard(message.includes("does not exist") ? "PostgreSQL is connected, but the schema migration has not been applied yet." : message);
  }
}

function numberValue(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function emptyDashboard(error: string): AdminDashboardData { return { status: "error", error, users: 0, corrections: 0, averageScore: 0, storedSentences: 0, words: 0, dueWords: 0, categories: [], models: [], recent: [] }; }
