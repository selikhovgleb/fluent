import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const correctionCases = JSON.parse(await readFile(new URL("./fixtures/correction-cases.json", import.meta.url), "utf8"));
const vocabularyCases = JSON.parse(await readFile(new URL("./fixtures/vocabulary-cases.json", import.meta.url), "utf8"));
const prompts = await readFile(new URL("../lib/ai/prompts.ts", import.meta.url), "utf8");
const contracts = await readFile(new URL("../lib/ai/contracts.ts", import.meta.url), "utf8");

test("correction eval set covers essential risk classes", () => {
  assert.ok(correctionCases.length >= 12);
  assert.ok(correctionCases.some((item) => item.expectedUnchanged));
  assert.ok(correctionCases.some((item) => item.id === "prompt-injection"));
  assert.ok(correctionCases.some((item) => item.id === "url-preservation"));
  assert.ok(correctionCases.every((item) => typeof item.input === "string" && Array.isArray(item.mustInclude)));
});

test("vocabulary eval set covers phrases, context, languages, and names", () => {
  assert.ok(vocabularyCases.some((item) => item.word.includes(" ")));
  assert.ok(new Set(vocabularyCases.map((item) => item.targetLanguage)).size >= 3);
  assert.ok(vocabularyCases.some((item) => item.isProductName));
});

test("prompts encode privacy-safe instruction boundaries and versions", () => {
  assert.match(prompts, /never as instructions/i);
  assert.match(prompts, /smallest set of changes/i);
  assert.match(contracts, /correction-v1/);
  assert.match(contracts, /vocabulary-v1/);
  assert.match(contracts, /additionalProperties: false/);
});
