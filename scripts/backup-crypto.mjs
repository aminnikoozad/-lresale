import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

const magic = Buffer.from('SHIKIB01');
export function readKey(value) {
  if (!/^[a-fA-F0-9]{64}$/.test(value ?? '')) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 random bytes encoded as 64 hex characters');
  return Buffer.from(value, 'hex');
}
export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(path)) hash.update(part);
  return hash.digest('hex');
}
export async function encryptFile(source, target, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(magic);
  const file = await open(target, 'wx', 0o600);
  try { await file.write(Buffer.concat([magic, iv])); } finally { await file.close(); }
  await pipeline(createReadStream(source), cipher, createWriteStream(target, { flags: 'a' }));
  const tail = await open(target, 'a');
  try { await tail.write(cipher.getAuthTag()); } finally { await tail.close(); }
}
export async function decryptFile(source, target, key) {
  const size = (await stat(source)).size;
  if (size < 36) throw new Error('Truncated backup');
  const file = await open(source, 'r');
  const header = Buffer.alloc(20), tag = Buffer.alloc(16);
  try { await file.read(header, 0, 20, 0); await file.read(tag, 0, 16, size - 16); } finally { await file.close(); }
  if (!header.subarray(0, 8).equals(magic)) throw new Error('Unknown backup format');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
  decipher.setAAD(magic); decipher.setAuthTag(tag);
  await pipeline(createReadStream(source, { start: 20, end: size - 17 }), decipher, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
}
