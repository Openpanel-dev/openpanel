import envTemplate from '../../.env.template' with { type: 'text' };
import caddyTemplate from '../../caddy/Caddyfile.template' with {
  type: 'text',
};
import clickhouseConfig from '../../clickhouse/clickhouse-config.xml' with {
  type: 'text',
};
import clickhouseUserConfig from '../../clickhouse/clickhouse-user-config.xml' with {
  type: 'text',
};
import clickhouseInit from '../../clickhouse/init-db.sh' with { type: 'text' };
import composeTemplate from '../../docker-compose.template.yml' with {
  type: 'text',
};
import redpandaTemplate from '../../redpanda/bootstrap.template.yaml' with {
  type: 'text',
};
import { RELEASE_VERSION } from './version';

// `with { type: 'text' }` yields a string, but bun-types types *.xml as a DOM
// Document, so the two XML imports are narrowed here.
const asText = (value: unknown) => value as string;

export const templates = {
  caddy: caddyTemplate,
  clickhouseConfig: asText(clickhouseConfig),
  clickhouseInit,
  clickhouseUserConfig: asText(clickhouseUserConfig),
  compose: composeTemplate,
  env: envTemplate,
  redpanda: redpandaTemplate,
} as const;

export const DEFAULT_EVENTS_TOPIC_PARTITIONS = 24;

const TEMPLATE_IMAGE_PATTERN = /lindesvard\/openpanel-api:(\S+)/;

// The exact version a release CLI installs, so CLI and images always match.
// null for a dev build (run from source), which leaves image tags alone.
export const STACK_IMAGE_TAG: string | null = RELEASE_VERSION;

// Only a default for local testing with a dev build; nothing shipped reads it.
export const TEMPLATE_IMAGE_TAG = TEMPLATE_IMAGE_PATTERN.exec(
  templates.compose
)?.[1] as string;

export const renderRedpandaBootstrap = (partitions: number): string =>
  templates.redpanda.replace(
    '$KAFKA_EVENTS_TOPIC_PARTITIONS',
    String(partitions)
  );
