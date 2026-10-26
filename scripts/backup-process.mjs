import { spawn } from 'node:child_process';

// Only fixed categories leave process memory. Never log raw stderr, arguments,
// environment, URLs, database names, filenames, or the underlying exception.
export function classifyDiagnostic(value) {
  const rules = [
    ['database-version-mismatch', /server version mismatch|server version:.*pg_dump version:/is],
    ['authentication-failed', /password authentication failed|authentication failed/i],
    ['database-permission-denied', /permission denied for (table|schema|sequence)|must be (owner|superuser)/i],
    ['network-unreachable', /network is unreachable|no route to host/i],
    ['dns-resolution-failed', /could not translate host name|temporary failure in name resolution|no such host/i],
    ['connection-refused', /connection refused/i],
    ['connection-timeout', /connection timed out|timeout expired/i],
    ['tls-failed', /certificate verify failed|SSL error|TLS handshake/i],
    ['disk-full', /no space left on device/i],
    ['docker-unavailable', /cannot connect to the Docker daemon|permission denied.*docker\.sock/i],
    ['image-pull-failed', /manifest unknown|pull access denied|toomanyrequests|failed to resolve reference/i],
    ['archive-invalid', /unsupported version.*file header|does not appear to be a valid archive/i],
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] ?? 'unclassified';
}

export class BackupProcessError extends Error {
  constructor(stage, category, exitCode) {
    super(`Backup stage=${stage} category=${category} exit=${exitCode}`);
    this.category = category;
  }
}

export function run(stage, command, args, env = {}) {
  console.log(`Backup stage=${stage} started`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
    let tail = '', category = 'unclassified';
    child.stderr.on('data', chunk => {
      tail = (tail + chunk.toString()).slice(-65536);
      const detected = classifyDiagnostic(tail);
      if (detected !== 'unclassified') category = detected;
    });
    child.on('error', () => reject(new BackupProcessError(stage, 'process-start-failed', 'none')));
    child.on('close', code => {
      tail = '';
      if (code !== 0) reject(new BackupProcessError(stage, category, Number.isInteger(code) ? code : 'signal'));
      else { console.log(`Backup stage=${stage} passed`); resolve(); }
    });
  });
}
