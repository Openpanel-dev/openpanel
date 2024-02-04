CREATE TABLE test.events (
  `name` String,
  `profile_id` String,
  `project_id` String,
  -- the route
  `path` String,
  `utm_source` String,
  `utm_medium` String,
  `utm_campaign` String,
  `utm_term` String,
  `utm_content` String,
  `referrer` String,
  `referrer_name` String,
  `duration` UInt64,
  `properties` Map(String, String),
  `created_at` DateTime64(3),
  `country` String,
  `city` String,
  `region` String,
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

CREATE TABLE test.profiles (
  `id` String,
  `external_id` String,
  `first_name` String,
  `last_name` String,
  `email` String,
  `avatar` String,
  `properties` Map(String, String),
  `project_id` String,
  `created_at` DateTime
) ENGINE = ReplacingMergeTree
ORDER BY
  (id) SETTINGS index_granularity = 8192;