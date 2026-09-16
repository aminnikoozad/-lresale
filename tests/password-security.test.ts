import test from "node:test";
import assert from "node:assert/strict";
import { checkPasswordCompromise, PasswordSafetyUnavailableError } from "../lib/password-security.ts";

const PASSWORD_SHA1_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

test("checks HIBP by 5-character SHA-1 prefix and detects a compromised password", async () => {
  let requestedUrl = "";
  let requestedBody: BodyInit | null | undefined;
  const fakeFetch: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = init?.body;
    return new Response(`${PASSWORD_SHA1_SUFFIX}:12345\r\nABCDEF:0\r\n`, { status: 200 });
  };

  const result = await checkPasswordCompromise("password", fakeFetch);

  assert.equal(requestedUrl, "https://api.pwnedpasswords.com/range/5BAA6");
  assert.equal(requestedUrl.includes(PASSWORD_SHA1_SUFFIX), false);
  assert.equal(requestedBody, undefined);
  assert.deepEqual(result, { compromised: true, occurrences: 12345 });
});

test("ignores padded zero-count HIBP entries", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(`${PASSWORD_SHA1_SUFFIX}:0\r\n`, { status: 200 });

  const result = await checkPasswordCompromise("password", fakeFetch);
  assert.deepEqual(result, { compromised: false, occurrences: 0 });
});

test("fails closed when HIBP cannot be reached", async () => {
  const fakeFetch: typeof fetch = async () => new Response("unavailable", { status: 503 });

  await assert.rejects(
    () => checkPasswordCompromise("a-unique-test-password", fakeFetch),
    PasswordSafetyUnavailableError,
  );
});
