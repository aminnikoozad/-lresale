import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeRedirectPath } from '../lib/safe-redirect.ts';
const origin = 'https://lresale.vercel.app';
test('rejects external and browser-normalized backslash redirects', () => {
  for(const value of ['https://evil.example','//evil.example','/\\evil.example','/\t/evil.example',null]) {
    assert.equal(safeRedirectPath(value,origin),'/account');
  }
});
test('preserves valid internal destinations and query strings', () => {
  assert.equal(safeRedirectPath('/account?tab=items#pricing',origin),'/account?tab=items#pricing');
  assert.equal(safeRedirectPath('/update-password',origin),'/update-password');
});
