import { getCurrentUser, safetyIdentifier } from "../../../../lib/auth/current-user";
import { isVocabularyContract, vocabularyJsonSchema, VOCABULARY_PROMPT_VERSION } from "../../../../lib/ai/contracts";
import { AiConfigurationError, AiResponseError, createStructuredResponse, getAiModels } from "../../../../lib/ai/openai";
import { vocabularyInstructions } from "../../../../lib/ai/prompts";

type VocabularyInput = { word?: unknown; context?: unknown; targetLanguage?: unknown };

export async function POST(request: Request) {
  let body: VocabularyInput;
  try { body = await request.json() as VocabularyInput; }
  catch { return Response.json({ error: "Request body must be valid JSON.", code: "INVALID_JSON" }, { status: 400 }); }

  const word = typeof body.word === "string" ? body.word.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim().slice(0, 500) : "";
  const targetLanguage = safeLanguage(body.targetLanguage, "Polish");
  if (!word) return Response.json({ error: "A word or phrase is required.", code: "WORD_REQUIRED" }, { status: 400 });
  if (word.length > 100) return Response.json({ error: "Word or phrase must be 100 characters or fewer.", code: "WORD_TOO_LONG" }, { status: 400 });

  const model = getAiModels().vocabulary;
  try {
    const entry = await createStructuredResponse({
      model,
      instructions: vocabularyInstructions,
      input: { word_or_phrase: word, context: context || null, target_language: targetLanguage },
      schemaName: "fluent_vocabulary_entry",
      schema: vocabularyJsonSchema,
      maxOutputTokens: 500,
      reasoningEffort: "none",
      safetyIdentifier: await safetyIdentifier(await getCurrentUser()),
      validate: isVocabularyContract,
    });
    return Response.json({ entry, meta: { model, promptVersion: VOCABULARY_PROMPT_VERSION } });
  } catch (error) {
    if (error instanceof AiConfigurationError) return Response.json({ error: error.message, code: "AI_NOT_CONFIGURED" }, { status: 503 });
    if (error instanceof AiResponseError) return Response.json({ error: "The AI could not enrich this word. Please try again.", code: "AI_RESPONSE_ERROR" }, { status: 502 });
    return Response.json({ error: "Unexpected vocabulary error.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function safeLanguage(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const language = value.trim().slice(0, 40);
  return /^[\p{L} .'-]+$/u.test(language) ? language : fallback;
}
