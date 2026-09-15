import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyRecoverySession } from '../lib/recovery-session.ts';

test('a recovery link establishes a session in a browser without existing cookies', async () => {
  let signedIn = false;
  const client = { auth: {
    async setSession() { signedIn = true; return { error: null }; },
    async getUser() { return { data: { user: signedIn ? { id: 'test' } : null }, error: null }; },
  }};
  await verifyRecoverySession(client, new URLSearchParams('type=recovery&access_token=test-only&refresh_token=test-only'), true);
  assert.equal(signedIn, true);
});

test('expired or non-recovery links cannot reuse an unrelated existing login', async () => {
  const client = { auth: {
    async setSession() { return { error: new Error('expired') }; },
    async getUser() { return { data: { user: { id: 'existing' } }, error: null }; },
  }};
  for (const hash of ['error=access_denied', 'type=signup&access_token=x&refresh_token=y', 'type=recovery&access_token=x&refresh_token=y']) {
    await assert.rejects(verifyRecoverySession(client, new URLSearchParams(hash), true));
  }
});

test('a bare reset page needs a verified session and legacy PKCE sessions still work', async () => {
  const client = { auth: {
    async setSession() { throw new Error('must not run'); },
    async getUser() { return { data: { user: null as null | { id: string } }, error: null }; },
  }};
  await assert.rejects(verifyRecoverySession(client, new URLSearchParams(), false));
  client.auth.getUser = async () => ({ data: { user: { id: 'verified' } }, error: null });
  await verifyRecoverySession(client, new URLSearchParams(), false);
});
