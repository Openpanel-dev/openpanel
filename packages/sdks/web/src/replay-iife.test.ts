import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

test('the script-tag bundle loads its recorder and queues replay payloads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'openpanel-replay-iife-'));
  try {
    const outfile = join(directory, 'tracker.js');
    execFileSync(
      process.execPath,
      [
        'build',
        fileURLToPath(new URL('./tracker.ts', import.meta.url)),
        '--target=browser',
        '--format=iife',
        `--outfile=${outfile}`,
        '--define',
        '__OPENPANEL_REPLAY_URL__="https://openpanel.dev/op1-replay.js"',
      ],
      { stdio: 'pipe' }
    );
    const source = readFileSync(outfile, 'utf8');
    for (const scriptUrl of [undefined, 'https://custom.example/replay.js']) {
      const requested: string[] = [];
      const options = {
        clientId: 'fixture',
        disabled: true,
        sessionReplay: { enabled: true, scriptUrl },
      };
      const window: Record<string, unknown> = {
        op: { q: [['init', options]] },
      };
      const document = {
        currentScript: { src: 'https://cdn.example/op1.js' },
        referrer: '',
        createElement: () => ({ src: '', onload: () => undefined }),
        head: {
          appendChild(script: { src: string; onload: () => void }) {
            requested.push(script.src);
            window.__openpanel_replay = {
              startReplayRecorder(
                config: unknown,
                send: (chunk: unknown) => void
              ) {
                assert.equal(config, options.sessionReplay);
                send({
                  chunk_index: 0,
                  events_count: 1,
                  is_full_snapshot: true,
                  started_at: 'start',
                  ended_at: 'end',
                  payload: 'fixture',
                });
              },
            };
            script.onload();
          },
        },
      };
      runInNewContext(source, {
        window,
        document,
        console,
        process: { env: {} },
        sessionStorage: { getItem: () => null },
      });
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(requested, [
        scriptUrl ?? 'https://cdn.example/op1-replay.js',
      ]);
      const instance = window.openpanel as {
        queue: { type: string; payload: { payload: string } }[];
      };
      assert.equal(instance.queue.length, 1);
      assert.equal(instance.queue[0]?.type, 'replay');
      assert.equal(instance.queue[0]?.payload.payload, 'fixture');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
