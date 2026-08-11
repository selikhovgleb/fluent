import { CORRECTION_PROMPT_VERSION, correctionJsonSchema, isCorrectionContract } from "../../../lib/ai/contracts";
import { AiConfigurationError, AiResponseError, createStructuredResponse, getAiModels } from "../../../lib/ai/openai";
import { correctionInstructions } from "../../../lib/ai/prompts";
import { recordCorrection } from "../../../lib/analytics/corrections";
import { getCurrentUser, safetyIdentifier } from "../../../lib/auth/current-user";

type CorrectionInput = {
  text?: unknown;
  dialect?: unknown;
  tone?: unknown;
  explanationLanguage?: unknown;
  proficiency?: unknown;
  storeSentence?: unknown;
};

export async function POST(request: Request) {
  let body: CorrectionInput;
  try { body = await request.json() as CorrectionInput; }
  catch { return Response.json({ error: "Request body must be valid JSON.", code: "INVALID_JSON" }, { status: 400 }); }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Text is required.", code: "TEXT_REQUIRED" }, { status: 400 });
  if (text.length > 2000) return Response.json({ error: "Text must be 2,000 characters or fewer.", code: "TEXT_TOO_LONG" }, { status: 400 });

  const dialect = body.dialect === "en-GB" ? "en-GB" : "en-US";
  const tone = body.tone === "casual-natural" ? "casual-natural" : "professional-natural";
  const explanationLanguage = safeLanguage(body.explanationLanguage, "English");
  const proficiency = ["A1-A2", "B1-B2", "C1-C2"].includes(String(body.proficiency)) ? String(body.proficiency) : "B1-B2";
  const storeSentence = body.storeSentence === true;
  const user = await getCurrentUser();
  const model = getAiModels().correction;

  try {
    const result = await createStructuredResponse({
      model,
      instructions: correctionInstructions,
      input: { text, dialect, tone, explanation_language: explanationLanguage, proficiency },
      schemaName: "fluent_correction",
      schema: correctionJsonSchema,
      maxOutputTokens: 1400,
      reasoningEffort: "low",
      safetyIdentifier: await safetyIdentifier(user),
      validate: isCorrectionContract,
    });

    const corrections = addVerifiedPositions(text, result.corrections);
    await recordCorrection({ user, result, originalText: text, storeSentence, model, promptVersion: CORRECTION_PROMPT_VERSION }).catch(() => undefined);

    return Response.json({
      corrected: result.corrected_text,
      score: result.score,
      summary: result.summary,
      found: corrections.map((item) => ({
        wrong: item.original,
        right: item.replacement,
        category: humanizeCategory(item.category),
        categoryKey: item.category,
        kind: item.kind,
        note: item.explanation,
        learningTip: item.learning_tip,
        start: item.start,
        end: item.end,
      })),
      meta: { model, promptVersion: CORRECTION_PROMPT_VERSION, sentenceStored: Boolean(user && storeSentence) },
    });
  } catch (error) {
    if (error instanceof AiConfigurationError) return Response.json({ error: error.message, code: "AI_NOT_CONFIGURED" }, { status: 503 });
    if (error instanceof AiResponseError) return Response.json({ error: "The AI could not analyse this text. Please try again.", code: "AI_RESPONSE_ERROR" }, { status: 502 });
    return Response.json({ error: "Unexpected correction error.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function safeLanguage(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const language = value.trim().slice(0, 40);
  return /^[\p{L} .'-]+$/u.test(language) ? language : fallback;
}

function addVerifiedPositions<T extends { original: string }>(text: string, corrections: T[]) {
  let cursor = 0;
  return corrections.map((correction) => {
    let start = text.indexOf(correction.original, cursor);
    if (start < 0) start = text.toLocaleLowerCase().indexOf(correction.original.toLocaleLowerCase(), cursor);
    if (start < 0) start = text.indexOf(correction.original);
    const end = start < 0 ? -1 : start + correction.original.length;
    if (start >= 0) cursor = end;
    return { ...correction, start, end };
  }).filter((correction) => correction.start >= 0);
}

function humanizeCategory(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
