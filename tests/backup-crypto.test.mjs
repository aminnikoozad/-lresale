import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptFile, decryptFile, readKey } from '../scripts/backup-crypto.mjs';

test('encrypted backup roundtrip, wrong key, tampering and truncation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'backup-test-'));
  try {
    const source = join(dir, 'source'), encrypted = join(dir, 'encrypted');
    const bytes = randomBytes(1024 * 1024 + 13), key = randomBytes(32);
    await writeFile(source, bytes);
    await encryptFile(source, encrypted, key);
    await decryptFile(encrypted, join(dir, 'restored'), key);
    assert.deepEqual(await readFile(join(dir, 'restored')), bytes);
    await assert.rejects(decryptFile(encrypted, join(dir, 'wrong'), randomBytes(32)));
    const corrupted = await readFile(encrypted); corrupted[100] ^= 1;
    await writeFile(join(dir, 'corrupted'), corrupted);
    await assert.rejects(decryptFile(join(dir, 'corrupted'), join(dir, 'bad'), key));
    await writeFile(join(dir, 'truncated'), corrupted.subarray(0, 12));
    await assert.rejects(decryptFile(join(dir, 'truncated'), join(dir, 'short'), key));
    assert.throws(() => readKey('short'));
    assert.equal(readKey(key.toString('hex')).length, 32);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
