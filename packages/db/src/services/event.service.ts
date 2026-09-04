// The event service lives in @openpanel/core now (M7-002):
// packages/core/src/modules/event/event.service.ts, with every ClickHouse
// query rewritten onto the `sql` tag (packages/core/src/modules/event/src/
// event.sql.ts). Re-exported here for existing `@openpanel/db` importers
// (packages/trpc's event router, apps/api's export controller + is-bot hook,
// apps/worker's incoming-event job, the buffers' row types, the assistant/mcp
// tools) — same shape as session.service.ts since M7-001.
export {
  createBotEvent,
  createEvent,
  EVENT_COLUMNS,
  type EventListSelect,
  type GetEventListOptions,
  getConversionEventNames,
  getEventById,
  getEventList,
  getEventMetas,
  getEventMetasCached,
  getEventPropertyValuesCore,
  getEvents,
  getEventsCount,
  getTopEventNames,
  getTopPages,
  type IClickhouseBotEvent,
  type IClickhouseEvent,
  type IEventColumn,
  type IImportedEvent,
  type IServiceBotEvent,
  type IServiceCreateBotEventPayload,
  type IServiceCreateEventPayload,
  type IServiceCreateEventPayloadWithId,
  type IServiceEvent,
  type IServiceEventMinimal,
  type IServiceImportedEventPayload,
  type IServicePage,
  listEventNamesCore,
  listEventPropertiesCore,
  type QueryEventsInput,
  queryEventsCore,
  transformEvent,
  transformMinimalEvent,
  transformSessionToEvent,
} from '@openpanel/core';

import { getEventById } from '@openpanel/core';

// V1's `eventService.getById(...)` shape, kept for the callers that still
// reach it through `@openpanel/db`. Resolved at call time: core ↔ db is an
// import cycle and this module may evaluate first.
export const eventService = {
  getById: (input: Parameters<typeof getEventById>[0]) => getEventById(input),
};
