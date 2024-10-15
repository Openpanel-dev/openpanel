-- +goose Up
-- +goose StatementBegin
CREATE MATERIALIZED VIEW cohort_events_mv ENGINE = AggregatingMergeTree()
ORDER BY (project_id, name, created_at, profile_id) POPULATE AS
SELECT project_id,
    name,
    toDate(created_at) AS created_at,
    profile_id,
    COUNT() AS event_count
FROM events_v2
WHERE profile_id != device_id
GROUP BY project_id,
    name,
    created_at,
    profile_id;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE MATERIALIZED VIEW distinct_event_names_mv ENGINE = AggregatingMergeTree()
ORDER BY (project_id, name, created_at) POPULATE AS
SELECT project_id,
    name,
    max(created_at) AS created_at,
    count() AS event_count
FROM events_v2
GROUP BY project_id,
    name;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE MATERIALIZED VIEW event_property_values_mv ENGINE = AggregatingMergeTree()
ORDER BY (project_id, name, property_key, property_value) POPULATE AS
select project_id,
    name,
    key_value.keys as property_key,
    key_value.values as property_value,
    created_at
from (
        SELECT project_id,
            name,
            untuple(arrayJoin(properties)) as key_value,
            max(created_at) as created_at
        from events_v2
        group by project_id,
            name,
            key_value
    )
where property_value != ''
    and property_key != ''
    and property_key NOT IN ('__duration_from', '__properties_from')
group by project_id,
    name,
    property_key,
    property_value,
    created_at;
-- +goose StatementEnd
-- +goose Down
-- +goose StatementBegin
SELECT 'down SQL query';
-- +goose StatementEnd