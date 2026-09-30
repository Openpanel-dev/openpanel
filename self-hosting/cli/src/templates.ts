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

const TEMPLATE_IMAGE_TAG = /lindesvard\/openpanel-api:(\S+)/;

// The OpenPanel image tag this CLI installs: its own version for a release
// build, so CLI and images always match; the template's tag for a dev build.
export const STACK_IMAGE_TAG: string =
  RELEASE_VERSION ??
  (TEMPLATE_IMAGE_TAG.exec(templates.compose)?.[1] as string);

export const renderRedpandaBootstrap = (partitions: number): string =>
  templates.redpanda.replace(
    '$KAFKA_EVENTS_TOPIC_PARTITIONS',
    String(partitions)
  );
