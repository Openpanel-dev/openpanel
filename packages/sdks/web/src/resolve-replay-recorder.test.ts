import { describe, expect, it, vi } from 'vitest';

import { resolveSessionReplayRecorder } from './resolve-replay-recorder';

describe('resolveSessionReplayRecorder', () => {
  it('prefers an explicit recorder so the host can opt into rrweb', async () => {
    const recorder = vi.fn();
    const loadIifeRecorder = vi.fn();

    const resolved = await resolveSessionReplayRecorder({
      recorder,
      isIifeBuild: false,
      loadIifeRecorder,
    });

    expect(resolved).toBe(recorder);
    expect(loadIifeRecorder).not.toHaveBeenCalled();
  });

  it('loads the CDN script only for the IIFE build', async () => {
    const recorder = vi.fn();
    const loadIifeRecorder = vi.fn().mockResolvedValue(recorder);

    const resolved = await resolveSessionReplayRecorder({
      isIifeBuild: true,
      loadIifeRecorder,
    });

    expect(loadIifeRecorder).toHaveBeenCalledOnce();
    expect(resolved).toBe(recorder);
  });

  it('returns null in the library build when no recorder is provided', async () => {
    const loadIifeRecorder = vi.fn();

    const resolved = await resolveSessionReplayRecorder({
      isIifeBuild: false,
      loadIifeRecorder,
    });

    expect(resolved).toBeNull();
    expect(loadIifeRecorder).not.toHaveBeenCalled();
  });
});
