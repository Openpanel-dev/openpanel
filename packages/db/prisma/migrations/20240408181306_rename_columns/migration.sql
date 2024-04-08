-- Project 
-- organization_slug -> organizationSlug
ALTER TABLE
  IF EXISTS "projects" RENAME COLUMN "organization_slug" TO "organizationSlug";

-- ProjectAccess
-- project_id -> projectId
-- organization_slug -> organizationSlug
-- user_id -> userId
ALTER TABLE
  IF EXISTS "project_access" RENAME COLUMN "project_id" TO "projectId";

ALTER TABLE
  IF EXISTS "project_access" RENAME COLUMN "organization_slug" TO "organizationSlug";

ALTER TABLE
  IF EXISTS "project_access" RENAME COLUMN "user_id" TO "userId";

-- Event
-- project_id -> projectId
-- profile_id -> profileId
ALTER TABLE
  IF EXISTS "events" RENAME COLUMN "project_id" TO "projectId";

ALTER TABLE
  IF EXISTS "events" RENAME COLUMN "profile_id" TO "profileId";

-- Profile
-- external_id -> externalId
-- first_name -> firstName
-- last_name -> lastName
-- project_id -> projectId
ALTER TABLE
  IF EXISTS "profiles" RENAME COLUMN "external_id" TO "externalId";

ALTER TABLE
  IF EXISTS "profiles" RENAME COLUMN "first_name" TO "firstName";

ALTER TABLE
  IF EXISTS "profiles" RENAME COLUMN "last_name" TO "lastName";

ALTER TABLE
  IF EXISTS "profiles" RENAME COLUMN "project_id" TO "projectId";

-- Client
-- project_id -> projectId
-- organization_slug -> organizationSlug
ALTER TABLE
  IF EXISTS "clients" RENAME COLUMN "project_id" TO "projectId";

ALTER TABLE
  IF EXISTS "clients" RENAME COLUMN "organization_slug" TO "organizationSlug";

-- Dashboard
-- organization_slug -> organizationSlug
-- project_id -> projectId
ALTER TABLE
  IF EXISTS "dashboards" RENAME COLUMN "organization_slug" TO "organizationSlug";

ALTER TABLE
  IF EXISTS "dashboards" RENAME COLUMN "project_id" TO "projectId";

-- Report
-- chart_type -> chartType
-- line_type -> lineType
-- project_id -> projectId
-- dashboard_id -> dashboardId
ALTER TABLE
  IF EXISTS "reports" RENAME COLUMN "chart_type" TO "chartType";

ALTER TABLE
  IF EXISTS "reports" RENAME COLUMN "line_type" TO "lineType";

ALTER TABLE
  IF EXISTS "reports" RENAME COLUMN "project_id" TO "projectId";

ALTER TABLE
  IF EXISTS "reports" RENAME COLUMN "dashboard_id" TO "dashboardId";

-- ShareOverview
-- project_id -> projectId
-- organization_slug -> organizationSlug
ALTER TABLE
  IF EXISTS "shares" RENAME COLUMN "project_id" TO "projectId";

ALTER TABLE
  IF EXISTS "shares" RENAME COLUMN "organization_slug" TO "organizationSlug";

-- EventMeta (ta bort constraint)
-- project_id -> projectId
ALTER TABLE
  IF EXISTS "event_meta" RENAME COLUMN "project_id" TO "projectId";

-- Reference
-- project_id -> projectId
ALTER TABLE
  IF EXISTS "references" RENAME COLUMN "project_id" TO "projectId";