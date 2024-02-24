CREATE TABLE openpanel.events (
  `id` UUID DEFAULT generateUUIDv4(),
  `name` String,
  `device_id` String,
  `profile_id` String,
  `project_id` String,
  `session_id` String,
  `path` String,
  `referrer` String,
  `referrer_name` String,
  `referrer_type` String,
  `duration` UInt64,
  `properties` Map(String, String),
  `created_at` DateTime64(3),
  `country` String,
  `city` String,
  `region` String,
  `continent` String,
  `os` String,
  `os_version` String,
  `browser` String,
  `browser_version` String,
  -- device: mobile/desktop/tablet
  `device` String,
  -- brand: (Samsung, OnePlus)
  `brand` String,
  -- model: (Samsung Galaxy, iPhone X)
  `model` String
) ENGINE MergeTree
ORDER BY
  (project_id, created_at, profile_id) SETTINGS index_granularity = 8192;

CREATE TABLE openpanel.events_bots (
  `project_id` String,
  `name` String,
  `type` String,
  `path` String,
  `created_at` DateTime64(3),
) ENGINE MergeTree
ORDER BY
  (project_id, created_at) SETTINGS index_granularity = 8192;

CREATE TABLE profiles (
  `id` String,
  `external_id` String,
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

ALTER TABLE
  events
ADD
  COLUMN session_id String
AFTER
  project_id;

ALTER TABLE
  events DROP COLUMN id;

CREATE TABLE ba (
  `id` UUID DEFAULT generateUUIDv4(),
  `a` String,
  `b` String
) ENGINE MergeTree
ORDER BY
  (a, b) SETTINGS index_granularity = 8192;