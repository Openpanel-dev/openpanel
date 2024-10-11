-- +goose Up
-- +goose StatementBegin
CREATE TABLE profiles_fixed
(
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
)
ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, id)
SETTINGS index_granularity = 8192;
-- +goose StatementEnd

-- +goose StatementBegin
INSERT INTO profiles_fixed SELECT
    id,
    is_external,
    first_name,
    last_name,
    email,
    avatar,
    properties,
    project_id,
    created_at
FROM profiles;
-- +goose StatementEnd

-- +goose StatementBegin
OPTIMIZE TABLE profiles_fixed FINAL;
-- +goose StatementEnd

-- +goose StatementBegin
RENAME TABLE profiles TO profiles_old, profiles_fixed TO profiles;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE profiles_old;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- This is a destructive migration, so the down migration is not provided.
-- If needed, you should restore from a backup.
SELECT 'down migration not implemented';
-- +goose StatementEnd
