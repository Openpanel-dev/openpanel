// Stubs shared by the http tests.

import type { AppDeps, Buffers } from '../src/context';
import { createRecordingProducers } from '../src/jobs/testing';
import { queues } from '../src/jobs.registry';
import { testCoreConfig } from './config-fixture';
import { type CapturedLogger, capturingLogger } from './rpc-fixtures';

export interface AppDepsStub {
  deps: AppDeps;
  logger: CapturedLogger;
  /** One per `createCtx`. */
  scopeCalls: () => number;
  childCalls: () => Record<string, unknown>[];
}

export function stubAppDeps(): AppDepsStub {
  const producers = createRecordingProducers(queues);
  const scope = producers.scope.bind(producers);
  let scopeCalls = 0;
  producers.scope = (meta) => {
    scopeCalls++;
    return scope(meta);
  };

  const childCalls: Record<string, unknown>[] = [];
  const base = capturingLogger();
  const logger: CapturedLogger = {
    ...base,
    child: (bindings) => {
      childCalls.push(bindings);
      return logger;
    },
  };

  return {
    logger,
    scopeCalls: () => scopeCalls,
    childCalls: () => childCalls,
    deps: {
      db: {} as AppDeps['db'],
      prisma: {} as AppDeps['prisma'],
      ch: {} as AppDeps['ch'],
      redis: {} as AppDeps['redis'],
      clients: {} as AppDeps['clients'],
      buffers: {} as Buffers,
      producers,
      logger,
      config: testCoreConfig(),
    },
  };
}
