-- +goose Up
-- +goose StatementBegin
CREATE DATABASE IF NOT EXISTS openpanel;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS self_hosting_replicated ON CLUSTER '{cluster}' (
  created_at Date,
  domain String,
  count UInt64
) ENGINE = ReplicatedMergeTree(
  '/clickhouse/tables/{shard}/self_hosting_replicated',
  '{replica}'
)
ORDER BY (domain, created_at) PARTITION BY toYYYYMM(created_at);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS events_replicated ON CLUSTER '{cluster}' (
  `id` UUID DEFAULT generateUUIDv4(),
  `name` String,
  `sdk_name` String,
  `sdk_version` String,
  `device_id` String,
  `profile_id` String,
  `project_id` String,
  `session_id` String,
  `path` String,
  `origin` String,
  `referrer` String,
  `referrer_name` String,
  `referrer_type` String,
  `duration` UInt64,
  `properties` Map(String, String),
  `created_at` DateTime64(3),
  `country` String,
  `city` String,
  `region` String,
  `longitude` Nullable(Float32),
  `latitude` Nullable(Float32),
  `os` String,
  `os_version` String,
  `browser` String,
  `browser_version` String,
  `device` String,
  `brand` String,
  `model` String,
  `imported_at` Nullable(DateTime),
  INDEX idx_name name TYPE bloom_filter GRANULARITY 1,
  INDEX idx_properties_bounce properties ['__bounce'] TYPE
  set(3) GRANULARITY 1,
    INDEX idx_origin origin TYPE bloom_filter(0.05) GRANULARITY 1,
    INDEX idx_path path TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = ReplicatedMergeTree(
  '/clickhouse/tables/{shard}/events_replicated',
  '{replica}'
) PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, toDate(created_at), profile_id, name) SETTINGS index_granularity = 8192;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS events_bots_replicated ON CLUSTER '{cluster}' (
  `id` UUID DEFAULT generateUUIDv4(),
  `project_id` String,
  `name` String,
  `type` String,
  `path` String,
  `created_at` DateTime64(3)
) ENGINE = ReplicatedMergeTree(
  '/clickhouse/tables/{shard}/events_bots_replicated',
  '{replica}'
)
ORDER BY (project_id, created_at) SETTINGS index_granularity = 8192;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS profiles_replicated ON CLUSTER '{cluster}' (
  `id` String,
  `is_external` Bool,
  `first_name` String,
  `last_name` String,
  `email` String,
  `avatar` String,
  `properties` Map(String, String),
  `project_id` String,
  `created_at` DateTime,
  INDEX idx_first_name first_name TYPE bloom_filter GRANULARITY 1,
  INDEX idx_last_name last_name TYPE bloom_filter GRANULARITY 1,
  INDEX idx_email email TYPE bloom_filter GRANULARITY 1
) ENGINE = ReplicatedReplacingMergeTree(
  '/clickhouse/tables/{shard}/profiles_replicated',
  '{replica}',
  created_at
) PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, id) SETTINGS index_granularity = 8192;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS profile_aliases_replicated ON CLUSTER '{cluster}' (
  `project_id` String,
  `profile_id` String,
  `alias` String,
  `created_at` DateTime
) ENGINE = ReplicatedMergeTree(
  '/clickhouse/tables/{shard}/profile_aliases_replicated',
  '{replica}'
)
ORDER BY (project_id, profile_id, alias, created_at) SETTINGS index_granularity = 8192;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS dau_mv_replicated ON CLUSTER '{cluster}' ENGINE = ReplicatedAggregatingMergeTree(
  '/clickhouse/tables/{shard}/dau_mv_replicated',
  '{replica}'
) PARTITION BY toYYYYMMDD(date)
ORDER BY (project_id, date) AS
SELECT toDate(created_at) as date,
  uniqState(profile_id) as profile_id,
  project_id
FROM events_replicated
GROUP BY date,
  project_id;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS cohort_events_mv_replicated ON CLUSTER '{cluster}' ENGINE = ReplicatedAggregatingMergeTree(
  '/clickhouse/tables/{shard}/cohort_events_mv_replicated',
  '{replica}'
)
ORDER BY (project_id, name, created_at, profile_id) AS
SELECT project_id,
  name,
  toDate(created_at) AS created_at,
  profile_id,
  COUNT() AS event_count
FROM events_replicated
WHERE profile_id != device_id
GROUP BY project_id,
  name,
  created_at,
  profile_id;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS distinct_event_names_mv_replicated ON CLUSTER '{cluster}' ENGINE = ReplicatedAggregatingMergeTree(
  '/clickhouse/tables/{shard}/distinct_event_names_mv_replicated',
  '{replica}'
)
ORDER BY (project_id, name, created_at) AS
SELECT project_id,
  name,
  max(created_at) AS created_at,
  count() AS event_count
FROM events_replicated
GROUP BY project_id,
  name;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS event_property_values_mv_replicated ON CLUSTER '{cluster}' ENGINE = ReplicatedAggregatingMergeTree(
  '/clickhouse/tables/{shard}/event_property_values_mv_replicated',
  '{replica}'
)
ORDER BY (project_id, name, property_key, property_value) AS
SELECT project_id,
  name,
  key_value.keys as property_key,
  key_value.values as property_value,
  created_at
FROM (
    SELECT project_id,
      name,
      untuple(arrayJoin(properties)) as key_value,
      max(created_at) as created_at
    FROM events_replicated
    GROUP BY project_id,
      name,
      key_value
  )
WHERE property_value != ''
  AND property_key != ''
  AND property_key NOT IN ('__duration_from', '__properties_from')
GROUP BY project_id,
  name,
  property_key,
  property_value,
  created_at;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS self_hosting_distributed ON CLUSTER '{cluster}' AS self_hosting_replicated ENGINE = Distributed(
  '{cluster}',
  openpanel,
  self_hosting_replicated,
  cityHash64(domain)
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS events_distributed ON CLUSTER '{cluster}' AS events_replicated ENGINE = Distributed(
  '{cluster}',
  openpanel,
  events_replicated,
  cityHash64(project_id, toString(toStartOfHour(created_at)))
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS events_bots_distributed ON CLUSTER '{cluster}' AS events_bots_replicated ENGINE = Distributed(
  '{cluster}',
  openpanel,
  events_bots_replicated,
  cityHash64(project_id, toString(toStartOfDay(created_at)))
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS profiles_distributed ON CLUSTER '{cluster}' AS profiles_replicated ENGINE = Distributed(
  '{cluster}',
  openpanel,
  profiles_replicated,
  cityHash64(project_id)
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS dau_mv_distributed ON CLUSTER '{cluster}' AS dau_mv_replicated ENGINE = Distributed(
  '{cluster}',
  openpanel,
  dau_mv_replicated,
  rand()
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS cohort_events_mv_distributed ON CLUSTER '{cluster}' AS cohort_events_mv_replicated ENGINE = Distributed(
  '{cluster}',
  openpanel,
  cohort_events_mv_replicated,
  rand()
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS distinct_event_names_mv_distributed ON CLUSTER '{cluster}' AS distinct_event_names_mv_replicated ENGINE = Distributed(
  '{cluster}',
  openpanel,
  distinct_event_names_mv_replicated,
  rand()
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS event_property_values_mv_distributed ON CLUSTER '{cluster}' AS event_property_values_mv_replicated ENGINE = Distributed(
  '{cluster}',
  openpanel,
  event_property_values_mv_replicated,
  rand()
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS profile_aliases_distributed ON CLUSTER '{cluster}' AS profile_aliases_replicated ENGINE = Distributed(
  '{cluster}',
  openpanel,
  profile_aliases_replicated,
  cityHash64(project_id)
);
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO events_replicated
SELECT *
FROM events_v2 -- +goose StatementEnd
  -- +goose StatementBegin
INSERT INTO events_bots_replicated
SELECT *
FROM events_bots;
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO profiles_replicated
SELECT *
FROM profiles;
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO profile_aliases_replicated
SELECT *
FROM profile_aliases;
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO self_hosting_replicated
SELECT *
FROM self_hosting;
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO dau_mv_replicated
SELECT *
FROM dau_mv;
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO cohort_events_mv_replicated
SELECT *
FROM cohort_events_mv;
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO distinct_event_names_mv_replicated
SELECT *
FROM distinct_event_names_mv;
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO event_property_values_mv_replicated
SELECT *
FROM event_property_values_mv;
-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS events_distributed ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS events_bots_distributed ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS profiles_distributed ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS events_replicated ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS events_bots_replicated ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS profiles_replicated ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS profile_aliases_replicated ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS dau_mv_replicated ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS cohort_events_mv_replicated ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS distinct_event_names_mv_replicated ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS event_property_values_mv_replicated ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS dau_mv_distributed ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS cohort_events_mv_distributed ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS distinct_event_names_mv_distributed ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS event_property_values_mv_distributed ON CLUSTER '{cluster}' SYNC;
-- +goose StatementEnd
TRUNCATE TABLE events_replicated;
TRUNCATE TABLE events_bots_replicated;
TRUNCATE TABLE profiles_replicated;
TRUNCATE TABLE profile_aliases_replicated;
TRUNCATE TABLE self_hosting_replicated;
TRUNCATE TABLE dau_mv_replicated;
TRUNCATE TABLE cohort_events_mv_replicated;
TRUNCATE TABLE distinct_event_names_mv_replicated;
TRUNCATE TABLE event_property_values_mv_replicated;