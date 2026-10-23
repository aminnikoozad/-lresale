// Server-side operational job only. Never import from application code.
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { encryptFile, decryptFile, hashFile, readKey } from './backup-crypto.mjs';

process.umask(0o077);
function required(name) { if (!process.env[name]) throw new Error(`Missing ${name}`); return process.env[name]; }
function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    // Do not forward tool diagnostics: they may contain credentials or customer filenames.
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'ignore'] });
    child.on('error', () => reject(new Error(`${command} could not start`)));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)));
  });
}
const project = 'lsdhobwrnmlkqnvkamlt';
const url = new URL(required('BACKUP_SUPABASE_URL'));
if (url.href !== `https://${project}.supabase.co/`) throw new Error('Backup source must be Shikimomo production');
const db = new URL(required('BACKUP_DATABASE_URL'));
if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.password ||
    !(db.hostname === `db.${project}.supabase.co` ||
      (db.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(db.username) === `postgres.${project}`)) ||
    db.pathname !== '/postgres') throw new Error('Use the production direct or session-pooler connection');
const endpoint = new URL(required('R2_BACKUP_ENDPOINT'));
if (endpoint.protocol !== 'https:' || !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname) || endpoint.pathname !== '/' || endpoint.username || endpoint.password || endpoint.search) throw new Error('Invalid R2 endpoint');
const bucket = required('R2_BACKUP_BUCKET');
if (bucket !== 'shikimomo-backups') throw new Error('Use the dedicated shikimomo-backups bucket');
const key = readKey(required('BACKUP_ENCRYPTION_KEY'));
const supabase = createClient(url.origin, required('BACKUP_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const s3 = new S3Client({ region: 'auto', endpoint: endpoint.origin, credentials: { accessKeyId: required('R2_BACKUP_ACCESS_KEY_ID'), secretAccessKey: required('R2_BACKUP_SECRET_ACCESS_KEY') } });
const root = await mkdtemp(join(tmpdir(), 'shikimomo-backup-'));
try {
  const payload = join(root, 'payload');
  await mkdir(join(payload, 'objects'), { recursive: true });
  const started = new Date().toISOString();
  const pgEnv = { PGHOST: db.hostname, PGPORT: db.port || '5432', PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password), PGDATABASE: 'postgres', PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '30' };
  // Read-only, transactionally consistent full database archive, including auth,
  // application/private schemas, RLS, functions and storage metadata.
  const docker = ['run', '--rm', '--network', 'host', '-v', `${payload}:/backup`];
  for (const name of Object.keys(pgEnv)) docker.push('-e', name);
  await run('docker', [...docker, 'postgres:17.6', 'pg_dump', '--format=custom', '--no-owner', '--lock-wait-timeout=30000', '--file=/backup/database.dump'], pgEnv);
  await run('docker', ['run', '--rm', '-v', `${payload}:/backup:ro`, 'postgres:17.6', 'pg_restore', '--list', '/backup/database.dump']);
  const manifest = { format: 1, project, started, database: { file: 'database.dump', sha256: await hashFile(join(payload, 'database.dump')) }, buckets: [], objects: [], limitations: ['Storage is captured after the database snapshot; writes during the run may require reconciliation.', 'Provider settings, edge-function secrets and custom role passwords require separate recovery.'] };
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error || !buckets) throw new Error('Could not enumerate storage buckets');
  for (const b of buckets) {
    manifest.buckets.push(b);
    const pending = [''];
    const seen = new Set();
    while (pending.length) {
      const prefix = pending.pop();
      if (seen.has(prefix)) throw new Error('Storage enumeration cycle');
      seen.add(prefix);
      for (let offset = 0; ; offset += 100) {
        const page = await supabase.storage.from(b.id).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (page.error || !page.data) throw new Error('Could not enumerate storage objects');
        for (const item of page.data) {
          const name = prefix ? `${prefix}/${item.name}` : item.name;
          if (!item.id) { pending.push(name); continue; }
          const file = `objects/${createHash('sha256').update(JSON.stringify([b.id, name])).digest('hex')}`;
          const object = await supabase.storage.from(b.id).download(name);
          if (object.error || !object.data) throw new Error('Storage changed or object download failed; backup incomplete');
          const bytes = Buffer.from(await object.data.arrayBuffer());
          await writeFile(join(payload, file), bytes, { flag: 'wx' });
          manifest.objects.push({ bucket: b.id, name, file, contentType: item.metadata?.mimetype || object.data.type, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
        }
        if (page.data.length < 100) break;
      }
    }
  }
  manifest.finished = new Date().toISOString();
  await writeFile(join(payload, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const archive = join(root, 'backup.tar.gz'), encrypted = join(root, 'backup.enc');
  await run('tar', ['-czf', archive, '-C', payload, '.']);
  await encryptFile(archive, encrypted, key);
  const sha256 = await hashFile(encrypted);
  const id = `${started.replaceAll(':', '-')}-${randomUUID()}`;
  const objectKey = `daily/${id}.tar.gz.enc`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: createReadStream(encrypted), ContentLength: (await stat(encrypted)).size, ContentType: 'application/octet-stream', IfNoneMatch: '*', Metadata: { sha256 } }));
  // Read back the actual stored bytes and authenticate/decrypt them before
  // writing a success marker. Never claim a completed backup on upload alone.
  const remote = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  const downloaded = join(root, 'downloaded.enc'), decoded = join(root, 'decoded.tar.gz');
  if (!remote.Body) throw new Error('R2 read-back missing');
  const { createWriteStream } = await import('node:fs');
  await pipeline(remote.Body, createWriteStream(downloaded, { flags: 'wx', mode: 0o600 }));
  if (await hashFile(downloaded) !== sha256) throw new Error('R2 read-back checksum mismatch');
  await decryptFile(downloaded, decoded, key);
  if (await hashFile(decoded) !== await hashFile(archive)) throw new Error('Decryption verification failed');
  await run('tar', ['-tzf', decoded]);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `daily/${id}.verified.json`, Body: JSON.stringify({ format: 1, objectKey, sha256, completed: new Date().toISOString(), objects: manifest.objects.length, databaseArchiveChecked: true, encryptedReadbackChecked: true, fullRestoreTested: false }), ContentType: 'application/json', IfNoneMatch: '*' }));
  console.log(`Verified encrypted database/storage backup uploaded: ${objectKey}; objects=${manifest.objects.length}. Full restore drill is still required.`);
} finally { await rm(root, { recursive: true, force: true }); }
