import { env } from "cloudflare:workers";

type RuntimeEnv = { DB?: D1Database };

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
  const db = (env as unknown as RuntimeEnv).DB;
  if (!db) return emptyDashboard("The DB runtime binding is unavailable.");

  try {
    const [userResult, correctionResult, wordResult, categoryResult, modelResult, recentResult] = await db.batch([
      db.prepare("SELECT COUNT(*) AS total FROM users"),
      db.prepare(`SELECT COUNT(*) AS total, COALESCE(ROUND(AVG(score)), 0) AS average_score, COALESCE(SUM(CASE WHEN original_text IS NOT NULL THEN 1 ELSE 0 END), 0) AS stored_sentences FROM correction_events`),
      db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN next_review_at <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END), 0) AS due_words FROM vocabulary_words`),
      db.prepare(`SELECT json_each.key AS category, SUM(CAST(json_each.value AS INTEGER)) AS total FROM correction_events, json_each(correction_events.categories_json) GROUP BY json_each.key ORDER BY total DESC LIMIT 8`),
      db.prepare(`SELECT model, prompt_version, COUNT(*) AS total FROM correction_events GROUP BY model, prompt_version ORDER BY total DESC`),
      db.prepare(`SELECT correction_events.id, COALESCE(users.email, users.display_name, 'Anonymous') AS user_label, correction_events.score, correction_events.mistake_count, correction_events.original_text IS NOT NULL AS sentence_stored, correction_events.model, correction_events.prompt_version, correction_events.created_at FROM correction_events LEFT JOIN users ON users.id = correction_events.user_id ORDER BY correction_events.created_at DESC LIMIT 12`),
    ]);

    const userRow = firstRow(userResult);
    const correctionRow = firstRow(correctionResult);
    const wordRow = firstRow(wordResult);
    return {
      status: "connected",
      error: null,
      users: numberValue(userRow.total),
      corrections: numberValue(correctionRow.total),
      averageScore: numberValue(correctionRow.average_score),
      storedSentences: numberValue(correctionRow.stored_sentences),
      words: numberValue(wordRow.total),
      dueWords: numberValue(wordRow.due_words),
      categories: rows(categoryResult).map((row) => ({ category: String(row.category), count: numberValue(row.total) })),
      models: rows(modelResult).map((row) => ({ model: String(row.model), promptVersion: String(row.prompt_version), count: numberValue(row.total) })),
      recent: rows(recentResult).map((row) => ({ id: String(row.id), user: String(row.user_label), score: numberValue(row.score), mistakes: numberValue(row.mistake_count), sentenceStored: Boolean(row.sentence_stored), model: String(row.model), promptVersion: String(row.prompt_version), createdAt: String(row.created_at) })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    return emptyDashboard(message.includes("no such table") ? "The database is connected, but its migration has not been applied yet." : message);
  }
}

function rows(result: D1Result<unknown>) { return (result.results ?? []) as Array<Record<string, unknown>>; }
function firstRow(result: D1Result<unknown>) { return rows(result)[0] ?? {}; }
function numberValue(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function emptyDashboard(error: string): AdminDashboardData { return { status: "error", error, users: 0, corrections: 0, averageScore: 0, storedSentences: 0, words: 0, dueWords: 0, categories: [], models: [], recent: [] }; }
