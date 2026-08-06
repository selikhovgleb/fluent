import { env } from "cloudflare:workers";
import type { CorrectionContract } from "../ai/contracts";
import type { CurrentUser } from "../auth/current-user";

type RuntimeEnv = { DB?: D1Database };

export async function recordCorrection(input: {
  user: CurrentUser | null;
  result: CorrectionContract;
  originalText: string;
  storeSentence: boolean;
  model: string;
  promptVersion: string;
}) {
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.DB || !input.user) return;

  const categories = input.result.corrections.reduce<Record<string, number>>((counts, correction) => {
    counts[correction.category] = (counts[correction.category] || 0) + 1;
    return counts;
  }, {});

  await runtime.DB.batch([
    runtime.DB.prepare(`
      INSERT INTO users (id, auth_provider, provider_user_id, email, display_name)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        updated_at = CURRENT_TIMESTAMP
    `).bind(input.user.id, input.user.provider, input.user.providerUserId, input.user.email, input.user.displayName),
    runtime.DB.prepare(`
      INSERT INTO correction_events (
        id, user_id, score, mistake_count, categories_json,
        original_text, corrected_text, prompt_version, model
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      input.user.id,
      input.result.score,
      input.result.corrections.length,
      JSON.stringify(categories),
      input.storeSentence ? input.originalText : null,
      input.storeSentence ? input.result.corrected_text : null,
      input.promptVersion,
      input.model,
    ),
  ]);
}
