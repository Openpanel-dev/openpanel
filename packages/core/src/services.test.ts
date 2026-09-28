// The composition root's two runtime invariants. Neither is visible to
// `tooling/gates/conformance.sh`, which reads signatures only.
//
// Deliberately mock-free: this suite exists to run the REAL 36 factories, so a
// `mock.module` here would test the stub instead of the composition root.

import { expect, test } from 'bun:test';
import type { Logger } from './logger';
import { createServices, type ServiceDeps } from './services';

const SERVICE_COUNT = 36;

function stubLogger(): Logger {
  const noop = () => undefined;
  const logger: Logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
}

/** Everything a factory must NOT touch while the container is being built:
 *  the `services()` thunk is deferred, and so is every connection-backed
 *  handle. Reaching one during construction names itself here. */
function constructionOnlyDeps(): ServiceDeps {
  const unavailable = (name: string): never => {
    throw new Error(`${name} was read while the container was being built`);
  };
  return {
    logger: stubLogger(),
    get db(): never {
      return unavailable('ServiceDeps.db');
    },
    get ch(): never {
      return unavailable('ServiceDeps.ch');
    },
    get redis(): never {
      return unavailable('ServiceDeps.redis');
    },
    get clients(): never {
      return unavailable('ServiceDeps.clients');
    },
    get buffers(): never {
      return unavailable('ServiceDeps.buffers');
    },
    get queues(): never {
      return unavailable('ServiceDeps.queues');
    },
  } as unknown as ServiceDeps;
}

test('every factory builds without reaching a sibling or a connection', () => {
  const services = createServices(constructionOnlyDeps());

  const missing = Object.entries(services)
    .filter(([, member]) => member === undefined)
    .map(([key]) => key);
  expect(missing).toEqual([]);
  expect(Object.keys(services)).toHaveLength(SERVICE_COUNT);
});

test('each call returns its own container — the graph is per unit of work', () => {
  const first = createServices(constructionOnlyDeps());
  const second = createServices(constructionOnlyDeps());

  expect(second).not.toBe(first);
  expect(second.session).not.toBe(first.session);
});
