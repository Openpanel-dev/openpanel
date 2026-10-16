-- ClickHouse schema for the ISOLATED test database (see test/databases.ts).
--
-- Captured from the schema the V1 code-migrations produce, with every
-- statement made idempotent so test/bootstrap-databases.ts can replay it on
-- every run. Statements are separated by a line containing a single ';'.
--
-- Base tables come first; the materialized views SELECT from them.
--
-- Deliberately omitted: the `epv_keys` projection migration 19 adds to
-- event_property_values_mv. It lives on the view's implicit `.inner_id.<uuid>`
-- storage table, so it cannot be named in portable DDL, and it changes only
-- how a query is read, never what it returns.
--
-- This is a TEST-ONLY artifact. It is not a migration and nothing outside
-- test/ reads it — packages/db/code-migrations remains the source of truth
-- for real databases.

CREATE TABLE IF NOT EXISTS cohort_members
(
    `project_id` String CODEC(ZSTD(3)),
    `cohort_id` String CODEC(ZSTD(3)),
    `profile_id` String CODEC(ZSTD(3)),
    `matched_at` DateTime DEFAULT now(),
    `matching_properties` Map(String, String) CODEC(ZSTD(3)),
    `version` UInt64 DEFAULT 1,
    INDEX idx_profile profile_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_cohort cohort_id TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(matched_at)
ORDER BY (project_id, cohort_id, profile_id)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS cohort_metadata
(
    `project_id` String,
    `cohort_id` String,
    `member_count` UInt64,
    `last_computed_at` DateTime,
    `sample_profiles` Array(String),
    `version` UInt64 DEFAULT 1
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (project_id, cohort_id)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS events
(
    `id` UUID DEFAULT generateUUIDv4(),
    `name` LowCardinality(String),
    `sdk_name` LowCardinality(String),
    `sdk_version` LowCardinality(String),
    `device_id` String CODEC(ZSTD(3)),
    `profile_id` String CODEC(ZSTD(3)),
    `project_id` String CODEC(ZSTD(3)),
    `session_id` String CODEC(LZ4),
    `groups` Array(String) DEFAULT [] CODEC(ZSTD(3)),
    `path` String CODEC(ZSTD(3)),
    `origin` String CODEC(ZSTD(3)),
    `referrer` String CODEC(ZSTD(3)),
    `referrer_name` String CODEC(ZSTD(3)),
    `referrer_type` LowCardinality(String),
    `revenue` UInt64,
    `duration` UInt64 CODEC(Delta(4), LZ4),
    `properties` Map(String, String) CODEC(ZSTD(3)),
    `created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3)),
    `country` LowCardinality(FixedString(2)),
    `city` String,
    `region` LowCardinality(String),
    `longitude` Nullable(Float32) CODEC(Gorilla(4), LZ4),
    `latitude` Nullable(Float32) CODEC(Gorilla(4), LZ4),
    `os` LowCardinality(String),
    `os_version` LowCardinality(String),
    `browser` LowCardinality(String),
    `browser_version` LowCardinality(String),
    `device` LowCardinality(String),
    `brand` LowCardinality(String),
    `model` LowCardinality(String),
    `imported_at` Nullable(DateTime) CODEC(Delta(4), LZ4),
    `inserted_at` DateTime64(3) DEFAULT created_at,
    INDEX idx_name name TYPE bloom_filter GRANULARITY 1,
    INDEX idx_properties_bounce properties['__bounce'] TYPE set(3) GRANULARITY 1,
    INDEX idx_origin origin TYPE bloom_filter(0.05) GRANULARITY 1,
    INDEX idx_path path TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_profile_id profile_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_inserted_at inserted_at TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, toDate(created_at), created_at, name)
SETTINGS index_granularity = 8192, enable_block_offset_column = 1, enable_block_number_column = 1
;

CREATE TABLE IF NOT EXISTS events_bots
(
    `id` UUID DEFAULT generateUUIDv4(),
    `project_id` String,
    `name` String,
    `type` String,
    `path` String,
    `created_at` DateTime64(3)
)
ENGINE = MergeTree
ORDER BY (project_id, created_at)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS events_imports
(
    `id` UUID DEFAULT generateUUIDv4(),
    `name` LowCardinality(String),
    `sdk_name` LowCardinality(String),
    `sdk_version` LowCardinality(String),
    `device_id` String CODEC(ZSTD(3)),
    `profile_id` String CODEC(ZSTD(3)),
    `project_id` String CODEC(ZSTD(3)),
    `session_id` String CODEC(LZ4),
    `path` String CODEC(ZSTD(3)),
    `origin` String CODEC(ZSTD(3)),
    `referrer` String CODEC(ZSTD(3)),
    `referrer_name` String CODEC(ZSTD(3)),
    `referrer_type` LowCardinality(String),
    `duration` UInt64 CODEC(Delta(4), LZ4),
    `properties` Map(String, String) CODEC(ZSTD(3)),
    `created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3)),
    `country` LowCardinality(FixedString(2)),
    `city` String,
    `region` LowCardinality(String),
    `longitude` Nullable(Float32) CODEC(Gorilla(4), LZ4),
    `latitude` Nullable(Float32) CODEC(Gorilla(4), LZ4),
    `os` LowCardinality(String),
    `os_version` LowCardinality(String),
    `browser` LowCardinality(String),
    `browser_version` LowCardinality(String),
    `device` LowCardinality(String),
    `brand` LowCardinality(String),
    `model` LowCardinality(String),
    `imported_at` Nullable(DateTime) CODEC(Delta(4), LZ4),
    `import_id` String CODEC(ZSTD(3)),
    `import_status` LowCardinality(String) DEFAULT 'pending',
    `imported_at_meta` DateTime DEFAULT now()
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(imported_at_meta)
ORDER BY (import_id, created_at)
TTL imported_at_meta + toIntervalDay(7)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS groups
(
    `id` String,
    `project_id` String,
    `type` String,
    `name` String,
    `properties` Map(String, String),
    `created_at` DateTime,
    `version` UInt64,
    `deleted` UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree(version, deleted)
ORDER BY (project_id, id)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS gsc_daily
(
    `project_id` String CODEC(ZSTD(3)),
    `date` Date CODEC(Delta(2), LZ4),
    `clicks` UInt32 CODEC(Delta(4), LZ4),
    `impressions` UInt32 CODEC(Delta(4), LZ4),
    `ctr` Float32 CODEC(Gorilla(4), LZ4),
    `position` Float32 CODEC(Gorilla(4), LZ4),
    `synced_at` DateTime DEFAULT now() CODEC(Delta(4), LZ4)
)
ENGINE = ReplacingMergeTree(synced_at)
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, date)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS gsc_pages_daily
(
    `project_id` String CODEC(ZSTD(3)),
    `date` Date CODEC(Delta(2), LZ4),
    `page` String CODEC(ZSTD(3)),
    `clicks` UInt32 CODEC(Delta(4), LZ4),
    `impressions` UInt32 CODEC(Delta(4), LZ4),
    `ctr` Float32 CODEC(Gorilla(4), LZ4),
    `position` Float32 CODEC(Gorilla(4), LZ4),
    `synced_at` DateTime DEFAULT now() CODEC(Delta(4), LZ4)
)
ENGINE = ReplacingMergeTree(synced_at)
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, date, page)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS gsc_queries_daily
(
    `project_id` String CODEC(ZSTD(3)),
    `date` Date CODEC(Delta(2), LZ4),
    `query` String CODEC(ZSTD(3)),
    `clicks` UInt32 CODEC(Delta(4), LZ4),
    `impressions` UInt32 CODEC(Delta(4), LZ4),
    `ctr` Float32 CODEC(Gorilla(4), LZ4),
    `position` Float32 CODEC(Gorilla(4), LZ4),
    `synced_at` DateTime DEFAULT now() CODEC(Delta(4), LZ4)
)
ENGINE = ReplacingMergeTree(synced_at)
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, date, query)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS profile_aliases
(
    `project_id` String,
    `profile_id` String,
    `alias` String,
    `created_at` DateTime
)
ENGINE = MergeTree
ORDER BY (project_id, profile_id, alias, created_at)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS profiles
(
    `id` String CODEC(ZSTD(3)),
    `is_external` Bool,
    `first_name` String CODEC(ZSTD(3)),
    `last_name` String CODEC(ZSTD(3)),
    `email` String CODEC(ZSTD(3)),
    `avatar` String CODEC(ZSTD(3)),
    `properties` Map(String, String) CODEC(ZSTD(3)),
    `project_id` String CODEC(ZSTD(3)),
    `groups` Array(String) DEFAULT [] CODEC(ZSTD(3)),
    `created_at` DateTime64(3) CODEC(Delta(4), LZ4),
    `last_seen_at` DateTime64(3) CODEC(Delta(4), LZ4),
    INDEX idx_first_name first_name TYPE bloom_filter GRANULARITY 1,
    INDEX idx_last_name last_name TYPE bloom_filter GRANULARITY 1,
    INDEX idx_email email TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree(last_seen_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, id)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS self_hosting
(
    `created_at` Date,
    `domain` String,
    `count` UInt64
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (domain, created_at)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS session_replay_chunks
(
    `project_id` String CODEC(ZSTD(3)),
    `session_id` String CODEC(ZSTD(3)),
    `chunk_index` UInt16,
    `started_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3)),
    `ended_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3)),
    `events_count` UInt16,
    `is_full_snapshot` Bool,
    `payload` String CODEC(ZSTD(6))
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(started_at)
ORDER BY (project_id, session_id, started_at, chunk_index)
TTL started_at + toIntervalDay(30)
SETTINGS index_granularity = 8192
;

CREATE TABLE IF NOT EXISTS sessions
(
    `id` String,
    `project_id` String CODEC(ZSTD(3)),
    `profile_id` String CODEC(ZSTD(3)),
    `device_id` String CODEC(ZSTD(3)),
    `groups` Array(String) DEFAULT [] CODEC(ZSTD(3)),
    `created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3)),
    `ended_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3)),
    `is_bounce` Bool,
    `entry_origin` LowCardinality(String),
    `entry_path` String CODEC(ZSTD(3)),
    `exit_origin` LowCardinality(String),
    `exit_path` String CODEC(ZSTD(3)),
    `screen_view_count` Int32,
    `revenue` Float64,
    `event_count` Int32,
    `duration` UInt32,
    `country` LowCardinality(FixedString(2)),
    `region` LowCardinality(String),
    `city` String,
    `longitude` Nullable(Float32) CODEC(Gorilla(4), LZ4),
    `latitude` Nullable(Float32) CODEC(Gorilla(4), LZ4),
    `device` LowCardinality(String),
    `brand` LowCardinality(String),
    `model` LowCardinality(String),
    `browser` LowCardinality(String),
    `browser_version` LowCardinality(String),
    `os` LowCardinality(String),
    `os_version` LowCardinality(String),
    `utm_medium` String CODEC(ZSTD(3)),
    `utm_source` String CODEC(ZSTD(3)),
    `utm_campaign` String CODEC(ZSTD(3)),
    `utm_content` String CODEC(ZSTD(3)),
    `utm_term` String CODEC(ZSTD(3)),
    `referrer` String CODEC(ZSTD(3)),
    `referrer_name` String CODEC(ZSTD(3)),
    `referrer_type` LowCardinality(String),
    `sign` Int8,
    `version` UInt64
)
ENGINE = VersionedCollapsingMergeTree(sign, version)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, toDate(created_at), created_at)
SETTINGS index_granularity = 8192
;

CREATE MATERIALIZED VIEW IF NOT EXISTS cohort_events_mv
(
    `project_id` String,
    `name` LowCardinality(String),
    `created_at` Date,
    `profile_id` String,
    `event_count` UInt64
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, name, created_at, profile_id)
SETTINGS index_granularity = 8192
AS SELECT
    project_id,
    name,
    toDate(created_at) AS created_at,
    profile_id,
    count() AS event_count
FROM events
WHERE profile_id != device_id
GROUP BY
    project_id,
    name,
    created_at,
    profile_id
;

CREATE MATERIALIZED VIEW IF NOT EXISTS dau_mv
(
    `date` Date,
    `profile_id` AggregateFunction(uniq, String),
    `project_id` String
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMMDD(date)
ORDER BY (project_id, date)
SETTINGS index_granularity = 8192
AS SELECT
    toDate(created_at) AS date,
    uniqState(profile_id) AS profile_id,
    project_id
FROM events
GROUP BY
    date,
    project_id
;

CREATE MATERIALIZED VIEW IF NOT EXISTS distinct_event_names_mv
(
    `project_id` String,
    `name` LowCardinality(String),
    `created_at` DateTime64(3),
    `event_count` UInt64
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, name, created_at)
SETTINGS index_granularity = 8192
AS SELECT
    project_id,
    name,
    max(created_at) AS created_at,
    count() AS event_count
FROM events
GROUP BY
    project_id,
    name
;

CREATE MATERIALIZED VIEW IF NOT EXISTS event_profile_summary_mv
(
    `project_id` String,
    `profile_id` String,
    `name` LowCardinality(String),
    `event_date` DateTime,
    `event_count` AggregateFunction(count),
    `first_event_time` AggregateFunction(min, DateTime64(3)),
    `last_event_time` AggregateFunction(max, DateTime64(3)),
    `total_duration` AggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (project_id, name, event_date, profile_id)
SETTINGS index_granularity = 8192
AS SELECT
    project_id,
    profile_id,
    name,
    toStartOfDay(created_at) AS event_date,
    countState() AS event_count,
    minState(created_at) AS first_event_time,
    maxState(created_at) AS last_event_time,
    sumState(duration) AS total_duration
FROM events
WHERE profile_id != device_id
GROUP BY
    project_id,
    profile_id,
    name,
    event_date
;

CREATE MATERIALIZED VIEW IF NOT EXISTS event_property_profile_summary_mv
(
    `project_id` String,
    `profile_id` String,
    `name` LowCardinality(String),
    `property_key` String,
    `property_value` String,
    `event_date` DateTime,
    `event_count` AggregateFunction(count),
    `first_event_time` AggregateFunction(min, DateTime64(3)),
    `last_event_time` AggregateFunction(max, DateTime64(3))
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (project_id, name, property_key, property_value, event_date, profile_id)
SETTINGS index_granularity = 8192
AS SELECT
    project_id,
    profile_id,
    name,
    property_key,
    property_value,
    toStartOfDay(created_at) AS event_date,
    countState() AS event_count,
    minState(created_at) AS first_event_time,
    maxState(created_at) AS last_event_time
FROM events
ARRAY JOIN
    mapKeys(properties) AS property_key,
    mapValues(properties) AS property_value
WHERE (profile_id != device_id) AND (property_key != '') AND (property_value != '')
GROUP BY
    project_id,
    profile_id,
    name,
    property_key,
    property_value,
    event_date
;

CREATE MATERIALIZED VIEW IF NOT EXISTS event_property_values_mv
(
    `project_id` String,
    `name` LowCardinality(String),
    `property_key` String,
    `property_value` String,
    `created_at` DateTime64(3)
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, name, property_key, property_value)
SETTINGS index_granularity = 8192
AS SELECT
    project_id,
    name,
    key_value.keys AS property_key,
    key_value.values AS property_value,
    created_at
FROM
(
    SELECT
        project_id,
        name,
        untuple(arrayJoin(properties)) AS key_value,
        max(created_at) AS created_at
    FROM events
    GROUP BY
        project_id,
        name,
        key_value
)
WHERE (property_value != '') AND (property_key != '') AND (property_key NOT IN ('__duration_from', '__properties_from'))
GROUP BY
    project_id,
    name,
    property_key,
    property_value,
    created_at
;
