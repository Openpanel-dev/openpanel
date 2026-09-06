// The Kafka transport and the notification dispatch left this package at
// M11-003 for @openpanel/core (modules/ingest/src/kafka.ts and
// modules/notification/src/notification-dispatch.ts). What stays is V1's
// BullMQ queue definitions and the buffer singleton built on `cronQueue`,
// both still imported by packages/trpc's routers — a package this task's
// scope does not cover, so their deletion waits for the follow-up that may
// touch those call sites (see docs/TECH_DEBT.md).

export type { JobsOptions } from 'bullmq';
export type * from './src/queues';
export * from './src/queues';
