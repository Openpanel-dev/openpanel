import { expect, test } from 'bun:test';
import { getAiContext, withAiContext } from './context';

test('a separately bundled copy of the module sees the same context', async () => {
  const copy: typeof import('./context') = await import(
    `./context.ts?copy=${Date.now()}`
  );
  expect(copy.withAiContext).not.toBe(withAiContext);

  withAiContext({ name: 'outer' }, () => {
    expect(copy.getAiContext()?.name).toBe('outer');
  });
  copy.withAiContext({ name: 'from-copy' }, () => {
    expect(getAiContext()?.name).toBe('from-copy');
  });
});
