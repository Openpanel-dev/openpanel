// Unit tests for the sequence runner. Moved from
// apps/worker/src/jobs/lib/email-sequence.test.ts (M6-003). `sendEmail` is
// mocked, so these assert decisions — which step fires, whether the pointer
// moves, whether side effects run — rather than delivery. `mock.module` is
// not hoisted, so the subject is imported inside `beforeAll` — see AGENTS.md.

import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { subDays } from 'date-fns';

const sendEmail = mock(
  async (
    _template: string,
    _options: unknown
  ): Promise<Record<string, unknown> | null> => ({})
);
mock.module('../clients/email', () => ({ sendEmail }));

let runSequence: typeof import('./email-sequence').runSequence;
let step: typeof import('./email-sequence').step;
type SequenceStep<TCtx> = import('./email-sequence').SequenceStep<TCtx>;
type SequenceSubject<TCtx> = import('./email-sequence').SequenceSubject<TCtx>;

beforeAll(async () => {
  ({ runSequence, step } = await import('./email-sequence'));
});

interface Ctx {
  id: string;
}

const logger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
};

function makeSteps(
  overrides: Partial<SequenceStep<Ctx>>[] = []
): SequenceStep<Ctx>[] {
  const base: SequenceStep<Ctx>[] = [
    step<Ctx, 'onboarding-welcome'>({
      day: 0,
      step: 'first',
      template: 'onboarding-welcome',
      data: () => ({ firstName: 'A', dashboardUrl: 'x', hasData: true }),
    }),
    step<Ctx, 'onboarding-dashboards'>({
      day: 10,
      step: 'second',
      template: 'onboarding-dashboards',
      data: () => ({ firstName: 'A', dashboardUrl: 'x', hasData: true }),
    }),
  ];
  return base.map((entry, index) => ({ ...entry, ...overrides[index] }));
}

function makeSubject(
  pointer: string | null,
  daysAgo: number
): SequenceSubject<Ctx> {
  return {
    id: 'subject-1',
    email: 'user@example.com',
    anchor: subDays(new Date(), daysAgo),
    pointer,
    ctx: { id: 'subject-1' },
  };
}

function run(
  steps: SequenceStep<Ctx>[],
  subjects: SequenceSubject<Ctx>[],
  extra: Partial<Parameters<typeof runSequence<Ctx>>[0]> = {}
) {
  const onAdvance = mock(async () => undefined);
  const onComplete = mock(async () => undefined);
  return {
    onAdvance,
    onComplete,
    result: runSequence<Ctx>({
      name: 'test',
      steps,
      subjects,
      onAdvance,
      onComplete,
      logger,
      ...extra,
    }),
  };
}

beforeEach(() => {
  sendEmail.mockClear().mockResolvedValue({});
  logger.info.mockClear();
  logger.warn.mockClear();
  logger.error.mockClear();
});

test('sends the first step and advances the pointer', async () => {
  const { onAdvance, result } = run(makeSteps(), [makeSubject(null, 0)]);

  expect(await result).toMatchObject({ emailsSent: 1 });
  expect(sendEmail).toHaveBeenCalledWith('onboarding-welcome', {
    to: 'user@example.com',
    data: expect.objectContaining({ firstName: 'A' }),
  });
  expect(onAdvance).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'subject-1' }),
    'first'
  );
});

test('defers a step whose day gate has not been reached', async () => {
  const { onAdvance, result } = run(makeSteps(), [makeSubject('first', 3)]);

  expect(await result).toMatchObject({ emailsSent: 0, deferred: 1 });
  expect(sendEmail).not.toHaveBeenCalled();
  expect(onAdvance).not.toHaveBeenCalled();
});

test('completes rather than replays when the pointer is unknown', async () => {
  // The whole reason this branch exists: the old findIndex returned -1 for a
  // removed step, which restarted the sequence from the top.
  const { onAdvance, onComplete, result } = run(makeSteps(), [
    makeSubject('a-step-that-was-renamed', 40),
  ]);

  expect(await result).toMatchObject({ emailsSent: 0, completed: 1 });
  expect(sendEmail).not.toHaveBeenCalled();
  expect(onAdvance).not.toHaveBeenCalled();
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("advances past a step whose guard returns 'skip' and sends the next", async () => {
  const steps = makeSteps([{ shouldSend: async () => 'skip' as const }]);
  const { onAdvance, result } = run(steps, [makeSubject(null, 40)]);

  expect(await result).toMatchObject({ emailsSent: 1, stepsSkipped: 1 });
  expect(onAdvance).toHaveBeenNthCalledWith(1, expect.anything(), 'first');
  expect(onAdvance).toHaveBeenNthCalledWith(2, expect.anything(), 'second');
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect(sendEmail).toHaveBeenCalledWith(
    'onboarding-dashboards',
    expect.anything()
  );
});

test('holds the pointer when a guard returns false', async () => {
  const steps = makeSteps([{ shouldSend: async () => false }]);
  const { onAdvance, result } = run(steps, [makeSubject(null, 40)]);

  expect(await result).toMatchObject({ emailsSent: 0, deferred: 1 });
  expect(onAdvance).not.toHaveBeenCalled();
});

test("finishes the sequence when a guard returns 'complete'", async () => {
  const steps = makeSteps([{ shouldSend: async () => 'complete' as const }]);
  const { onComplete, result } = run(steps, [makeSubject(null, 40)]);

  expect(await result).toMatchObject({ emailsSent: 0, completed: 1 });
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(sendEmail).not.toHaveBeenCalled();
});

test('completes once the last step has been sent', async () => {
  const { onComplete, result } = run(makeSteps(), [makeSubject('second', 40)]);

  expect(await result).toMatchObject({ completed: 1 });
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('completes when the final step is skipped', async () => {
  const steps = makeSteps([
    undefined as never,
    { shouldSend: async () => 'skip' as const },
  ]);
  const { onComplete, result } = run(steps, [makeSubject('first', 40)]);

  expect(await result).toMatchObject({ stepsSkipped: 1, completed: 1 });
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('runs onSent before advancing', async () => {
  const calls: string[] = [];
  const steps = makeSteps([
    {
      onSent: async () => {
        calls.push('onSent');
      },
    },
  ]);
  const onAdvance = mock(async () => {
    calls.push('advance');
  });

  await runSequence<Ctx>({
    name: 'test',
    steps,
    subjects: [makeSubject(null, 0)],
    onAdvance,
    onComplete: mock(async () => undefined),
    logger,
  });

  expect(calls).toEqual(['onSent', 'advance']);
});

test('requireDelivery: does not advance or run onSent when the send is suppressed', async () => {
  // sendEmail resolves null (rather than throwing) for a suppressed or
  // misconfigured send, which is exactly the case a destructive step must
  // not act on.
  sendEmail.mockResolvedValue(null);
  const onSent = mock(async () => undefined);
  const steps = makeSteps([{ requireDelivery: true, onSent }]);
  const { onAdvance, result } = run(steps, [makeSubject(null, 0)]);

  expect(await result).toMatchObject({ emailsSent: 0, failed: 1 });
  expect(onSent).not.toHaveBeenCalled();
  expect(onAdvance).not.toHaveBeenCalled();
  expect(logger.error).toHaveBeenCalled();
});

test('requireDelivery: advances a step without the flag even when the send is suppressed', async () => {
  sendEmail.mockResolvedValue(null);
  const { onAdvance, result } = run(makeSteps(), [makeSubject(null, 0)]);

  expect(await result).toMatchObject({ emailsSent: 1 });
  expect(onAdvance).toHaveBeenCalledWith(expect.anything(), 'first');
});

test('holds the pointer when the send throws', async () => {
  sendEmail.mockRejectedValue(new Error('smtp down'));
  const { onAdvance, result } = run(makeSteps(), [makeSubject(null, 0)]);

  expect(await result).toMatchObject({ emailsSent: 0, failed: 1 });
  expect(onAdvance).not.toHaveBeenCalled();
});
