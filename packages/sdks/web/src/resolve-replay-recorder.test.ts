import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveSessionReplayRecorder } from './resolve-replay-recorder';

describe('session replay opt-in', () => {
  test('uses an explicit recorder for npm and script-tag builds', async () => {
    const recorder = () => undefined;
    for (const isIifeBuild of [false, true]) {
      const resolved = await resolveSessionReplayRecorder({
        recorder,
        isIifeBuild,
        loadIifeRecorder() {
          throw new Error('Explicit recorders must not load a script');
        },
      });
      assert.equal(resolved, recorder);
    }
  });

  test('does not load a script when npm replay has no recorder', async () => {
    const resolved = await resolveSessionReplayRecorder({
      isIifeBuild: false,
      loadIifeRecorder() {
        throw new Error('Npm consumers must explicitly import the recorder');
      },
    });
    assert.equal(resolved, null);
  });

  test('waits for a script-tag recorder', async () => {
    const recorder = () => undefined;
    const resolved = await resolveSessionReplayRecorder({
      isIifeBuild: true,
      loadIifeRecorder: async () => recorder,
    });
    assert.equal(resolved, recorder);
  });

  test('preserves the failed-script result', async () => {
    const resolved = await resolveSessionReplayRecorder({
      isIifeBuild: true,
      loadIifeRecorder: async () => null,
    });
    assert.equal(resolved, null);
  });
});
