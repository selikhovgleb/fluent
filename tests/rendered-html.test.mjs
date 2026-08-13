import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("build produces a deployable standalone Next.js server", async () => {
  await access(new URL("../.next/standalone/server.js", import.meta.url));
  const [page, layout, dockerfile] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Write with more/);
  assert.match(page, /Writing coach/);
  assert.match(page, /My words/);
  assert.match(layout, /Your everyday English coach/);
  assert.match(dockerfile, /\.next\/standalone/);
});

test("correction endpoint validates input and keeps the key server-side", async () => {
  const [route, client] = await Promise.all([
    readFile(new URL("../app/api/corrections/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai/openai.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /TEXT_REQUIRED/);
  assert.match(route, /TEXT_TOO_LONG/);
  assert.match(route, /storeSentence = settings\.storeSentences/);
  assert.doesNotMatch(route, /body\.storeSentence === true/);
  assert.match(client, /OPENAI_API_KEY/);
  assert.match(client, /store: false/);
  assert.doesNotMatch(await readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), /OPENAI_API_KEY/);
});

test("production deploy uses branch-scoped GitHub OIDC and a live health check", async () => {
  const [workflow, bootstrap] = await Promise.all([
    readFile(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8"),
    readFile(new URL("../infra/ci-bootstrap.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /configure-aws-credentials@v6\.2\.3/);
  assert.match(workflow, /\/api\/health/);
  assert.match(workflow, /OutputKey=='ApplicationUrl'/);
  assert.match(workflow, /deploy\.sh '\$IMAGE_URI' '\$APP_URL'/);
  assert.doesNotMatch(workflow, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
  assert.match(bootstrap, /repo:\$\{githubOwner\}@\$\{githubOwnerId\}\/\$\{githubRepository\}@\$\{githubRepositoryId\}:ref:refs\/heads\/\$\{githubBranch\}/);
  assert.match(bootstrap, /token\.actions\.githubusercontent\.com:aud/);
});

test("admin dashboard is protected and never selects sentence content", async () => {
  const [page, dashboard] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin/dashboard.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /requireAdmin\("\/admin"\)/);
  assert.match(page, /force-dynamic/);
  assert.match(page, /Sentence text hidden/);
  assert.match(dashboard, /COUNT\(\*\)/i);
  assert.doesNotMatch(dashboard, /SELECT[^`]*original_text\s*,/i);
  assert.doesNotMatch(dashboard, /SELECT[^`]*corrected_text/i);
});

test("AWS runtime uses PostgreSQL Data API, managed secrets, and Google OAuth", async () => {
  const [database, auth, proxy, infrastructure] = await Promise.all([
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../infra/app.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(database, /aws-data-api\/pg/);
  assert.match(auth, /next-auth\/providers\/google/);
  assert.match(auth, /process\.env\.AUTH_URL = process\.env\.APP_BASE_URL/);
  assert.match(proxy, /AUTH_REQUIRED/);
  assert.match(proxy, /api\/auth\|api\/health/);
  assert.match(infrastructure, /enableDataApi: true/);
  assert.match(infrastructure, /AmazonSSMManagedInstanceCore/);
  assert.match(infrastructure, /fetch_secret\(\)/);
  assert.match(infrastructure, /image\.repository\.grantPull/);
  assert.match(infrastructure, /userDataCausesReplacement: true/);
  assert.match(infrastructure, /new cloudfront\.Distribution/);
  assert.match(infrastructure, /CachePolicy\.CACHING_DISABLED/);
  assert.match(infrastructure, /OriginRequestPolicy\.ALL_VIEWER_EXCEPT_HOST_HEADER/);
  assert.match(infrastructure, /ViewerProtocolPolicy\.REDIRECT_TO_HTTPS/);
  assert.match(infrastructure, /X-Fluent-Origin-Verify/);
  assert.match(infrastructure, /AUTH_URL=\$APP_URL/);
  assert.match(infrastructure, /authSecret = importedSecret/);
  assert.match(infrastructure, /generatedSecret\(this, "OriginVerificationSecret", 48\)/);
  assert.doesNotMatch(infrastructure, /generatedSecret\(this, "AuthSecret"/);
  assert.match(infrastructure, /migration\.node\.addDependency\(database\.node\.findChild\("writer"\)\)/);
  assert.doesNotMatch(infrastructure, /Port\.tcp\(22\)/);
  assert.doesNotMatch(infrastructure, /Port\.tcp\(443\)/);
  assert.doesNotMatch(database, /cloudflare:workers|drizzle-orm\/d1/);
});
