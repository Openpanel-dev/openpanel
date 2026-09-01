// The composition root. Empty until the first module lands (ADR-007 build
// step 4): the point of writing it now is that the Ctx <-> Services
// circularity compiles.

import type { Ctx } from './context';

/** What every service factory receives — derived from Ctx, so it cannot drift. */
export type ServiceDeps = Pick<
  Ctx,
  'db' | 'ch' | 'redis' | 'clients' | 'buffers' | 'logger' | 'queues'
>;

// Two type rules the compiler enforces but cannot explain:
//
// 1. `Services` must stay an INTERFACE. A type alias over
//    `ReturnType<typeof createServices>` is circular — resolving it needs
//    every factory's signature and every factory's signature names
//    `Services`. Interface members resolve lazily, which breaks the loop.
// 2. Every service method needs an explicit return type, or a factory's
//    return type cannot be computed from signatures alone. Omit one and
//    typecheck fails with ts7022/ts7023 naming the method.
//
// biome-ignore lint/suspicious/noEmptyInterface: empty by design until the first module lands, and it must stay an interface — see rule 1.
export interface Services {}

export function createServices(_deps: ServiceDeps): Services {
  // When the first module lands, each factory is called with `deps` and a
  // `() => container` thunk: captured, not copied, so two services may call
  // each other without a cycle.
  const container: Services = {};

  return container;
}
