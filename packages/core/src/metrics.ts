// The one prom-client registry for the whole process (this package's
// AGENTS.md layout; TARGET_ARCHITECTURE §18: "One `prom-client` registry
// built by `core/src/metrics.ts`, served at `/metrics` from the ops scope in
// every role"). `apps/api/src/metrics.ts` and `apps/worker/src/metrics.ts`
// are V1-side registries that die with the apps they live in (ADR-007
// package fates: `worker` dies, `api` becomes a shell over this package) —
// core neither reads nor extends either one. Every collector a core module
// registers from here on registers on THIS registry, and only this one.

import client from 'prom-client';

export const registry = new client.Registry();
