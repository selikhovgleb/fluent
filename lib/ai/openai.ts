import { env } from "cloudflare:workers";

type RuntimeEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_CORRECTION_MODEL?: string;
  OPENAI_VOCABULARY_MODEL?: string;
};

type StructuredRequest<T> = {
  model: string;
  instructions: string;
  input: unknown;
  schemaName: string;
  schema: unknown;
  maxOutputTokens: number;
  reasoningEffort: "none" | "low";
  safetyIdentifier?: string;
  validate: (value: unknown) => value is T;
};

export class AiConfigurationError extends Error {}
export class AiResponseError extends Error {}

export function getAiModels() {
  const runtime = env as unknown as RuntimeEnv;
  return {
    correction: runtime.OPENAI_CORRECTION_MODEL || "gpt-5.6-terra",
    vocabulary: runtime.OPENAI_VOCABULARY_MODEL || "gpt-5.6-luna",
  };
}

export async function createStructuredResponse<T>(request: StructuredRequest<T>): Promise<T> {
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.OPENAI_API_KEY) throw new AiConfigurationError("AI service is not configured.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${runtime.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      reasoning: { effort: request.reasoningEffort },
      instructions: request.instructions,
      input: JSON.stringify(request.input),
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: request.schemaName,
          strict: true,
          schema: request.schema,
        },
      },
      max_output_tokens: request.maxOutputTokens,
      store: false,
      ...(request.safetyIdentifier ? { safety_identifier: request.safetyIdentifier } : {}),
    }),
  });

  const payload = await response.json() as {
    error?: { message?: string };
    status?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  };

  if (!response.ok) throw new AiResponseError(payload.error?.message || `AI request failed with ${response.status}.`);
  const content = payload.output?.flatMap((item) => item.content ?? []) ?? [];
  const refusal = content.find((item) => item.type === "refusal")?.refusal;
  if (refusal) throw new AiResponseError(refusal);
  const outputText = content.find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new AiResponseError(`AI returned no usable output (${payload.status || "unknown status"}).`);

  let parsed: unknown;
  try { parsed = JSON.parse(outputText); } catch { throw new AiResponseError("AI returned invalid JSON."); }
  if (!request.validate(parsed)) throw new AiResponseError("AI output did not match the application contract.");
  return parsed;
}
