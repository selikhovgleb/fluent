export const CORRECTION_PROMPT_VERSION = "correction-v1";
export const VOCABULARY_PROMPT_VERSION = "vocabulary-v1";

export const MISTAKE_CATEGORIES = [
  "verb_tense",
  "subject_verb_agreement",
  "articles",
  "prepositions",
  "word_order",
  "singular_plural",
  "pronouns",
  "spelling",
  "punctuation",
  "capitalization",
  "word_choice",
  "natural_phrasing",
  "clarity",
  "tone",
] as const;

export type MistakeCategory = typeof MISTAKE_CATEGORIES[number];

export type CorrectionContract = {
  corrected_text: string;
  score: number;
  summary: string;
  corrections: Array<{
    original: string;
    replacement: string;
    category: MistakeCategory;
    kind: "error" | "improvement";
    explanation: string;
    learning_tip: string;
  }>;
};

export type VocabularyContract = {
  word: string;
  translation: string;
  part_of_speech: string;
  pronunciation: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  definition: string;
  example: string;
};

const correctionItem = {
  type: "object",
  additionalProperties: false,
  required: ["original", "replacement", "category", "kind", "explanation", "learning_tip"],
  properties: {
    original: { type: "string" },
    replacement: { type: "string" },
    category: { type: "string", enum: [...MISTAKE_CATEGORIES] },
    kind: { type: "string", enum: ["error", "improvement"] },
    explanation: { type: "string" },
    learning_tip: { type: "string" },
  },
} as const;

export const correctionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["corrected_text", "score", "summary", "corrections"],
  properties: {
    corrected_text: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    corrections: { type: "array", items: correctionItem, maxItems: 30 },
  },
} as const;

export const vocabularyJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["word", "translation", "part_of_speech", "pronunciation", "level", "definition", "example"],
  properties: {
    word: { type: "string" },
    translation: { type: "string" },
    part_of_speech: { type: "string" },
    pronunciation: { type: "string" },
    level: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
    definition: { type: "string" },
    example: { type: "string" },
  },
} as const;

export function isCorrectionContract(value: unknown): value is CorrectionContract {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CorrectionContract>;
  return typeof item.corrected_text === "string"
    && Number.isInteger(item.score)
    && typeof item.summary === "string"
    && Array.isArray(item.corrections)
    && item.corrections.every((correction) =>
      correction
      && typeof correction.original === "string"
      && typeof correction.replacement === "string"
      && MISTAKE_CATEGORIES.includes(correction.category)
      && (correction.kind === "error" || correction.kind === "improvement")
      && typeof correction.explanation === "string"
      && typeof correction.learning_tip === "string"
    );
}

export function isVocabularyContract(value: unknown): value is VocabularyContract {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VocabularyContract>;
  return typeof item.word === "string"
    && typeof item.translation === "string"
    && typeof item.part_of_speech === "string"
    && typeof item.pronunciation === "string"
    && ["A1", "A2", "B1", "B2", "C1", "C2"].includes(item.level ?? "")
    && typeof item.definition === "string"
    && typeof item.example === "string";
}
