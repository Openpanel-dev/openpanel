import envTemplate from '../../.env.template' with { type: 'text' };
import caddyTemplate from '../../caddy/Caddyfile.template' with {
  type: 'text',
};
import composeTemplate from '../../docker-compose.template.yml' with {
  type: 'text',
};
import redpandaTemplate from '../../redpanda/bootstrap.template.yaml' with {
  type: 'text',
};

export const templates = {
  caddy: caddyTemplate,
  compose: composeTemplate,
  env: envTemplate,
  redpanda: redpandaTemplate,
} as const;

export const DEFAULT_EVENTS_TOPIC_PARTITIONS = 24;

export const renderRedpandaBootstrap = (partitions: number): string =>
  templates.redpanda.replace(
    '$KAFKA_EVENTS_TOPIC_PARTITIONS',
    String(partitions)
  );
