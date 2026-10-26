import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDiagnostic, run } from '../scripts/backup-process.mjs';

test('diagnostics distinguish known evidence from unknown failures', () => {
  for (const [message, category] of [
    ['pg_dump: aborting because of server version mismatch', 'database-version-mismatch'],
    ['password authentication failed', 'authentication-failed'],
    ['Network is unreachable', 'network-unreachable'],
    ['could not translate host name', 'dns-resolution-failed'],
    ['permission denied for table private', 'database-permission-denied'],
    ['something else failed', 'unclassified'],
  ]) assert.equal(classifyDiagnostic(message), category);
});

test('subprocess secrets and connection URLs never enter errors or console output', async () => {
  const logs = [], original = console.log;
  console.log = value => logs.push(value);
  try {
    await run('test-success', process.execPath, ['-e', 'process.exit(0)']);
    await assert.rejects(run('test-failure', process.execPath, ['-e',
      'process.stdout.write("FAKE_SECRET"); process.stderr.write("postgres://fake:FAKE_SECRET@private/db password authentication failed"); process.exit(1)']), error => {
        assert.equal(error.category, 'authentication-failed');
        assert.doesNotMatch(error.stack, /FAKE_SECRET|postgres:\/\/|private\/db/);
        return true;
      });
    await assert.rejects(run('test-unknown', process.execPath, ['-e', 'process.stderr.write("FAKE_SECRET"); process.exit(1)']), /category=unclassified/);
    await assert.rejects(run('test-missing', '/nonexistent-backup-command', []), /process-start-failed/);
    assert.doesNotMatch(logs.join('\n'), /FAKE_SECRET|postgres:\/\/|private\/db/);
  } finally { console.log = original; }
});
