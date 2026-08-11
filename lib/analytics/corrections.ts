import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { correctionEvents, users } from "../../db/schema";
import type { CorrectionContract } from "../ai/contracts";
import type { CurrentUser } from "../auth/current-user";

export async function recordCorrection(input: {
  user: CurrentUser | null;
  result: CorrectionContract;
  originalText: string;
  storeSentence: boolean;
  model: string;
  promptVersion: string;
}) {
  if (!input.user) return;

  const categories = input.result.corrections.reduce<Record<string, number>>((counts, correction) => {
    counts[correction.category] = (counts[correction.category] || 0) + 1;
    return counts;
  }, {});

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: input.user!.id,
      authProvider: input.user!.provider,
      providerUserId: input.user!.providerUserId,
      email: input.user!.email,
      displayName: input.user!.displayName,
    }).onConflictDoUpdate({
      target: users.id,
      set: {
        email: input.user!.email,
        displayName: input.user!.displayName,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

    await tx.insert(correctionEvents).values({
      id: crypto.randomUUID(),
      userId: input.user!.id,
      score: input.result.score,
      mistakeCount: input.result.corrections.length,
      categoriesJson: categories,
      originalText: input.storeSentence ? input.originalText : null,
      correctedText: input.storeSentence ? input.result.corrected_text : null,
      promptVersion: input.promptVersion,
      model: input.model,
    });
  });
}
