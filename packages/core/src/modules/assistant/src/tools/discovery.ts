import { tool } from 'ai';
import { z } from 'zod';
import {
  getEventPropertyValuesCore,
  listEventNamesCore,
  listEventPropertiesCore,
} from '../../../event/event.service';
import type { ChatToolContext } from '../context';
import { compactPropertyKeys } from './shared';

/** Properties sampled when describing one event. */
const SAMPLED_PROPERTY_COUNT = 6;
const SAMPLE_VALUES_PER_PROPERTY = 12;
/** Tracking internals the model never needs sample values for. */
const INTERNAL_PROPERTY_PREFIX = '__';

export function discoveryTools(ctx: ChatToolContext) {
  const { deps, projectId } = ctx;

  return {
    describe_data: tool({
      description:
        "What is tracked in this project. Without `eventName`: the event names (most frequent first), the built-in event columns and the custom property keys. With `eventName`: that event's property keys plus sample values. Call this before naming an event or property in any other tool; never guess names.",
      inputSchema: z.object({
        eventName: z
          .string()
          .optional()
          .describe(
            'Describe one event in depth instead of the whole project.'
          ),
      }),
      execute: async ({ eventName }) => {
        if (!eventName) {
          const [names, properties] = await Promise.all([
            listEventNamesCore(deps, projectId),
            listEventPropertiesCore(deps, { projectId }),
          ]);
          const compact = compactPropertyKeys(properties.properties);
          return {
            events: names,
            columns: properties.columns,
            properties: compact.properties,
            propertiesTruncated: compact.truncated,
            usage:
              'Columns are used bare (`path`, `country`). Custom keys are used as `properties.<key>`.',
          };
        }

        const properties = await listEventPropertiesCore(deps, {
          projectId,
          eventName,
        });
        const compact = compactPropertyKeys(properties.properties);
        const sampled = compact.properties
          .filter((key) => !key.startsWith(INTERNAL_PROPERTY_PREFIX))
          .slice(0, SAMPLED_PROPERTY_COUNT);
        const samples = await Promise.all(
          sampled.map(async (key) => {
            const result = await getEventPropertyValuesCore(deps, {
              projectId,
              eventName,
              propertyKey: `properties.${key}`,
            }).catch(() => null);
            return {
              key,
              values: result?.values.slice(0, SAMPLE_VALUES_PER_PROPERTY) ?? [],
            };
          })
        );
        return {
          event: eventName,
          columns: properties.columns,
          properties: compact.properties,
          propertiesTruncated: compact.truncated,
          samples,
        };
      },
    }),

    get_property_values: tool({
      description:
        'Distinct values of one property for one event, for exact filter values ("country = SE", "plan = pro"). Use the key form the data tool returned: a bare column name or `properties.<key>`.',
      inputSchema: z.object({
        eventName: z.string(),
        propertyKey: z.string(),
      }),
      execute: ({ eventName, propertyKey }) =>
        getEventPropertyValuesCore(deps, { projectId, eventName, propertyKey }),
    }),
  };
}
