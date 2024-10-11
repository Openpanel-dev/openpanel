-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS self_hosting
(
    created_at Date,
    domain String,
    count UInt64
)
ENGINE = MergeTree()
ORDER BY (domain, created_at)
PARTITION BY toYYYYMM(created_at);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS events_v2 (
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
  INDEX idx_properties_bounce properties ['__bounce'] TYPE set (3) GRANULARITY 1,
  INDEX idx_origin origin TYPE bloom_filter(0.05) GRANULARITY 1,
  INDEX idx_path path TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = MergeTree PARTITION BY toYYYYMM(created_at)
ORDER BY
  (project_id, toDate(created_at), profile_id, name) SETTINGS index_granularity = 8192;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS events_bots (
  `id` UUID DEFAULT generateUUIDv4(),
  `project_id` String,
  `name` String,
  `type` String,
  `path` String,
  `created_at` DateTime64(3)
) ENGINE MergeTree
ORDER BY
  (project_id, created_at) SETTINGS index_granularity = 8192;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS profiles (
  `id` String,
  `is_external` Bool,
  `first_name` String,
  `last_name` String,
  `email` String,
  `avatar` String,
  `properties` Map(String, String),
  `project_id` String,
  `created_at` DateTime
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY
  (id) SETTINGS index_granularity = 8192;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS profile_aliases (
  `project_id` String,
  `profile_id` String,
  `alias` String,
  `created_at` DateTime
) ENGINE = MergeTree
ORDER BY
  (project_id, profile_id, alias, created_at) SETTINGS index_granularity = 8192;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS dau_mv ENGINE = AggregatingMergeTree() PARTITION BY toYYYYMMDD(date)
ORDER BY
  (project_id, date) POPULATE AS
SELECT
  toDate(created_at) as date,
  uniqState(profile_id) as profile_id,
  project_id
FROM
  events_v2
GROUP BY
  date,
  project_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 'down SQL query';
-- +goose StatementEnd
