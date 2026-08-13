const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;

if (!requestUrl || !requestToken) {
  throw new Error("GitHub did not expose an OIDC token request endpoint. Check that id-token: write is effective for this job.");
}

const separator = requestUrl.includes("?") ? "&" : "?";
const response = await fetch(`${requestUrl}${separator}audience=${encodeURIComponent("sts.amazonaws.com")}`, {
  headers: { Authorization: `bearer ${requestToken}` },
});
if (!response.ok) throw new Error(`GitHub OIDC request failed with HTTP ${response.status}.`);

const body = await response.json();
if (typeof body.value !== "string") throw new Error("GitHub OIDC response did not contain a token.");
const segments = body.value.split(".");
if (segments.length !== 3) throw new Error("GitHub returned an invalid JWT.");
const claims = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));

const safeClaims = Object.fromEntries([
  "iss", "aud", "sub", "repository", "ref", "environment", "job_workflow_ref",
].filter((key) => claims[key] !== undefined).map((key) => [key, claims[key]]));

console.log(JSON.stringify(safeClaims, null, 2));
