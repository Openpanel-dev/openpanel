import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const packagePath = fileURLToPath(new URL('..', import.meta.url));
const sdkEntry = fileURLToPath(new URL('../index.ts', import.meta.url));
const replayEntry = fileURLToPath(
  new URL('./replay/index.ts', import.meta.url)
);

function bundleInputs(source: string): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'openpanel-replay-bundle-'));
  try {
    const entry = join(directory, 'entry.ts');
    const metafile = join(directory, 'meta.json');
    writeFileSync(entry, source);
    execFileSync(
      process.execPath,
      [
        'build',
        entry,
        '--target=browser',
        `--outfile=${join(directory, 'bundle.js')}`,
        `--metafile=${metafile}`,
      ],
      { cwd: packagePath, stdio: 'pipe' }
    );
    return Object.keys(JSON.parse(readFileSync(metafile, 'utf8')).inputs);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('npm bundles omit replay unless the consumer imports the recorder', () => {
  for (const enabled of [false, true]) {
    const inputs = bundleInputs(`
      import { OpenPanel } from ${JSON.stringify(sdkEntry)};
      new OpenPanel({ clientId: 'fixture', sessionReplay: { enabled: ${enabled} } });
    `);
    assert.equal(
      inputs.some((path) => /rrweb|src\/replay\/recorder/.test(path)),
      false
    );
  }

  const inputs = bundleInputs(`
    import { OpenPanel } from ${JSON.stringify(sdkEntry)};
    import { startReplayRecorder } from ${JSON.stringify(replayEntry)};
    new OpenPanel({ clientId: 'fixture', sessionReplay: {
      enabled: true, recorder: startReplayRecorder,
    } });
  `);
  assert.equal(
    inputs.some((path) => /rrweb/.test(path)),
    true
  );
});
