import { TABLE_NAMES } from '../clickhouse/client';
import {
  createTable,
  runClickhouseMigrationCommands,
} from '../clickhouse/migration';
import { type CodeMigrationEnv, getIsCluster, writeSqlDump } from './helpers';

/**
 * The typed store for AI observability. Every `ai_*` event also writes a slim
 * row to `events` (that is what reports, funnels and profiles read); this
 * table holds the prompt, completion and tool payloads and the numeric
 * columns the AI pages aggregate.
 *
 * `input`, `output` and `tools` carry a column TTL: the row stays, the content
 * goes after 30 days. Hashed like `events` so a trace's rows fan out the same
 * way on the cluster; a trace lookup must still use GLOBAL IN or a join.
 */
const CONTENT_TTL = 'TTL toDateTime(created_at) + INTERVAL 30 DAY';

export const AI_EVENTS_COLUMNS = [
  '`project_id` String CODEC(ZSTD(3))',
  '`id` UUID',
  '`type` LowCardinality(String)',
  '`trace_id` String CODEC(ZSTD(3))',
  '`span_id` String CODEC(ZSTD(3))',
  '`parent_id` String CODEC(ZSTD(3))',
  '`conversation_id` String CODEC(ZSTD(3))',
  '`name` LowCardinality(String)',
  '`model` LowCardinality(String)',
  '`provider` LowCardinality(String)',
  '`input_tokens` UInt32',
  '`output_tokens` UInt32',
  '`cache_read_tokens` UInt32',
  '`cache_write_tokens` UInt32',
  '`reasoning_tokens` UInt32',
  '`input_cost` Float64',
  '`output_cost` Float64',
  '`total_cost` Float64',
  '`cost_source` LowCardinality(String)',
  '`latency_ms` UInt32',
  '`time_to_first_token_ms` UInt32',
  '`is_error` Bool',
  '`http_status` UInt16',
  '`stop_reason` LowCardinality(String)',
  '`is_stream` Bool',
  '`model_parameters` String CODEC(ZSTD(3))',
  `\`input\` String CODEC(ZSTD(6)) ${CONTENT_TTL}`,
  `\`output\` String CODEC(ZSTD(6)) ${CONTENT_TTL}`,
  `\`tools\` String CODEC(ZSTD(6)) ${CONTENT_TTL}`,
  '`error` String CODEC(ZSTD(3))',
  '`profile_id` String CODEC(ZSTD(3))',
  '`device_id` String CODEC(ZSTD(3))',
  '`session_id` String CODEC(LZ4)',
  '`groups` Array(String) DEFAULT [] CODEC(ZSTD(3))',
  '`properties` Map(String, String) CODEC(ZSTD(3))',
  '`created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
];

export const AI_EVENTS_INDICES = [
  'INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1',
  'INDEX idx_conversation_id conversation_id TYPE bloom_filter(0.01) GRANULARITY 1',
  'INDEX idx_profile_id profile_id TYPE bloom_filter(0.01) GRANULARITY 1',
];

export async function up(env: CodeMigrationEnv) {
  const isClustered = getIsCluster(env);

  const sqls = createTable({
    name: TABLE_NAMES.ai_events,
    columns: AI_EVENTS_COLUMNS,
    indices: AI_EVENTS_INDICES,
    engine: 'MergeTree()',
    orderBy: ['project_id', 'toDate(created_at)', 'created_at'],
    partitionBy: 'toYYYYMM(created_at)',
    settings: { index_granularity: 8192 },
    distributionHash:
      'cityHash64(project_id, toString(toStartOfHour(created_at)))',
    replicatedVersion: '1',
    isClustered,
  });

  writeSqlDump(import.meta.url, sqls);

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}
