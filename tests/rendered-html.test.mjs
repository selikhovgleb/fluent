import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function request(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Fluent writing coach", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Fluent — Your everyday English coach<\/title>/i);
  assert.match(html, /Write with more/);
  assert.match(html, /Writing coach/);
  assert.match(html, /My words/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("correction endpoint validates input and keeps the key server-side", async () => {
  const [route, client] = await Promise.all([
    readFile(new URL("../app/api/corrections/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai/openai.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /TEXT_REQUIRED/);
  assert.match(route, /TEXT_TOO_LONG/);
  assert.match(route, /storeSentence === true/);
  assert.match(client, /OPENAI_API_KEY/);
  assert.match(client, /store: false/);
  assert.doesNotMatch(await readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), /OPENAI_API_KEY/);
});

test("admin dashboard is protected and never selects sentence content", async () => {
  const [page, dashboard] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin/dashboard.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /requireChatGPTUser\("\/admin"\)/);
  assert.match(page, /force-dynamic/);
  assert.match(page, /Sentence text hidden/);
  assert.match(dashboard, /COUNT\(\*\)/);
  assert.doesNotMatch(dashboard, /SELECT[^`]*original_text\s*,/i);
  assert.doesNotMatch(dashboard, /SELECT[^`]*corrected_text/i);
});
