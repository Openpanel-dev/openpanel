-- Minimal ClickHouse schema for MCP integration tests.
-- Creates only the tables that MCP tools query against.
-- Run against a fresh ClickHouse instance before executing the integration test suite.

CREATE DATABASE IF NOT EXISTS openpanel;

CREATE TABLE IF NOT EXISTS openpanel.events
(
    id UUID DEFAULT generateUUIDv4(),
    name LowCardinality(String),
    sdk_name LowCardinality(String),
    sdk_version LowCardinality(String),
    device_id String,
    profile_id String,
    project_id String,
    session_id String,
    groups Array(String) DEFAULT [],
    path String,
    origin String,
    referrer String,
    referrer_name String,
    referrer_type LowCardinality(String),
    revenue UInt64,
    duration UInt64,
    properties Map(String, String),
    created_at DateTime64(3),
    country LowCardinality(FixedString(2)),
    city String,
    region LowCardinality(String),
    longitude Nullable(Float32),
    latitude Nullable(Float32),
    os LowCardinality(String),
    os_version LowCardinality(String),
    browser LowCardinality(String),
    browser_version LowCardinality(String),
    device LowCardinality(String),
    brand LowCardinality(String),
    model LowCardinality(String),
    imported_at Nullable(DateTime)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, toDate(created_at), created_at, name)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS openpanel.profiles
(
    id String,
    is_external Bool,
    first_name String,
    last_name String,
    email String,
    avatar String,
    properties Map(String, String),
    project_id String,
    groups Array(String) DEFAULT [],
    created_at DateTime64(3)
)
ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, id)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS openpanel.sessions
(
    id String,
    project_id String,
    profile_id String,
    device_id String,
    created_at DateTime64(3),
    ended_at DateTime64(3),
    is_bounce Bool,
    entry_origin LowCardinality(String),
    entry_path String,
    exit_origin LowCardinality(String),
    exit_path String,
    screen_view_count Int32,
    revenue Float64,
    event_count Int32,
    duration UInt32,
    country LowCardinality(FixedString(2)),
    region LowCardinality(String),
    city String,
    longitude Nullable(Float32),
    latitude Nullable(Float32),
    device LowCardinality(String),
    brand LowCardinality(String),
    model LowCardinality(String),
    browser LowCardinality(String),
    browser_version LowCardinality(String),
    os LowCardinality(String),
    os_version LowCardinality(String),
    utm_medium String,
    utm_source String,
    utm_campaign String,
    utm_content String,
    utm_term String,
    referrer String,
    referrer_name String,
    referrer_type LowCardinality(String),
    sign Int8,
    version UInt64,
    properties Map(String, String)
)
ENGINE = VersionedCollapsingMergeTree(sign, version)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, id, toDate(created_at), profile_id)
SETTINGS index_granularity = 8192;

-- Materialized view tables (simplified as regular tables for testing)
-- The real ones are populated by triggers on events; these just need to exist.

CREATE TABLE IF NOT EXISTS openpanel.distinct_event_names_mv
(
    project_id String,
    name LowCardinality(String),
    count UInt64
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, name)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS openpanel.event_property_values_mv
(
    project_id String,
    name LowCardinality(String),
    property_key String,
    property_value String,
    created_at DateTime64(3)
)
ENGINE = MergeTree
ORDER BY (project_id, name, property_key)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS openpanel.dau_mv
(
    project_id String,
    profile_id AggregateFunction(uniq, String),
    date Date
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, date)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS openpanel.cohort_events_mv
(
    project_id String,
    profile_id String,
    week Date
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, week, profile_id)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS openpanel.groups
(
    id String,
    project_id String,
    group_id String,
    type String,
    properties Map(String, String),
    created_at DateTime64(3)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (project_id, type, group_id)
SETTINGS index_granularity = 8192;
