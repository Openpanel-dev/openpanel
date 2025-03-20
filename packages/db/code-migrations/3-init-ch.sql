CREATE DATABASE IF NOT EXISTS openpanel;

---

CREATE TABLE IF NOT EXISTS self_hosting (
  `created_at` Date,
  `domain` String,
  `count` UInt64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (domain, created_at);

---

CREATE TABLE IF NOT EXISTS events (
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
  `longitude` Nullable(Float32) CODEC(Gorilla, LZ4),
  `latitude` Nullable(Float32) CODEC(Gorilla, LZ4),
  `os` LowCardinality(String),
  `os_version` LowCardinality(String),
  `browser` LowCardinality(String),
  `browser_version` LowCardinality(String),
  `device` LowCardinality(String),
  `brand` LowCardinality(String),
  `model` LowCardinality(String),
  `imported_at` Nullable(DateTime) CODEC(Delta(4), LZ4),
  INDEX idx_name name TYPE bloom_filter GRANULARITY 1,
  INDEX idx_properties_bounce properties['__bounce'] TYPE set(3) GRANULARITY 1,
  INDEX idx_origin origin TYPE bloom_filter(0.05) GRANULARITY 1,
  INDEX idx_path path TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, toDate(created_at), profile_id, name)
SETTINGS index_granularity = 8192;

---

CREATE TABLE IF NOT EXISTS events_bots (
  `id` UUID DEFAULT generateUUIDv4(),
  `project_id` String,
  `name` String,
  `type` String,
  `path` String,
  `created_at` DateTime64(3)
)
ENGINE = MergeTree()
ORDER BY (project_id, created_at)
SETTINGS index_granularity = 8192;

---

CREATE TABLE IF NOT EXISTS profiles (
  `id` String CODEC(ZSTD(3)),
  `is_external` Bool,
  `first_name` String CODEC(ZSTD(3)),
  `last_name` String CODEC(ZSTD(3)),
  `email` String CODEC(ZSTD(3)),
  `avatar` String CODEC(ZSTD(3)),
  `properties` Map(String, String) CODEC(ZSTD(3)),
  `project_id` String CODEC(ZSTD(3)),
  `created_at` DateTime64(3) CODEC(Delta(4), LZ4),
  INDEX idx_first_name first_name TYPE bloom_filter GRANULARITY 1,
  INDEX idx_last_name last_name TYPE bloom_filter GRANULARITY 1,
  INDEX idx_email email TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, id)
SETTINGS index_granularity = 8192;

---

CREATE TABLE IF NOT EXISTS profile_aliases (
  `project_id` String,
  `profile_id` String,
  `alias` String,
  `created_at` DateTime
)
ENGINE = MergeTree()
ORDER BY (project_id, profile_id, alias, created_at)
SETTINGS index_granularity = 8192;

---

CREATE MATERIALIZED VIEW IF NOT EXISTS dau_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMMDD(date)
ORDER BY (project_id, date)
AS SELECT
        toDate(created_at) as date,
        uniqState(profile_id) as profile_id,
        project_id
      FROM events
      GROUP BY date, project_id;

---

CREATE MATERIALIZED VIEW IF NOT EXISTS cohort_events_mv
ENGINE = AggregatingMergeTree()
ORDER BY (project_id, name, created_at, profile_id)
AS SELECT
        project_id,
        name,
        toDate(created_at) AS created_at,
        profile_id,
        COUNT() AS event_count
      FROM events
      WHERE profile_id != device_id
      GROUP BY project_id, name, created_at, profile_id;

---

CREATE MATERIALIZED VIEW IF NOT EXISTS distinct_event_names_mv
ENGINE = AggregatingMergeTree()
ORDER BY (project_id, name, created_at)
AS SELECT
        project_id,
        name,
        max(created_at) AS created_at,
        count() AS event_count
      FROM events
      GROUP BY project_id, name;

---

CREATE MATERIALIZED VIEW IF NOT EXISTS event_property_values_mv
ENGINE = AggregatingMergeTree()
ORDER BY (project_id, name, property_key, property_value)
AS SELECT
        project_id,
        name,
        key_value.keys as property_key,
        key_value.values as property_value,
        created_at
      FROM (
        SELECT
          project_id,
          name,
          untuple(arrayJoin(properties)) as key_value,
          max(created_at) as created_at
        FROM events
        GROUP BY project_id, name, key_value
      )
      WHERE property_value != ''
        AND property_key != ''
        AND property_key NOT IN ('__duration_from', '__properties_from')
      GROUP BY project_id, name, property_key, property_value, created_at;