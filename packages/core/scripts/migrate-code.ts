// Compatibility entrypoint. `code-migrations` moved to @openpanel/db in
// M15-204 (ADR-022, Carl's rulings), but the shipped compose files and the
// Coolify template still run `cd /app/packages/core && bun
// scripts/migrate-code.ts`, and those files are outside that task's scope.
// This forwards so a self-hoster pulling the new image keeps migrating.
//
// Delete this the moment self-hosting/docker-compose.template.yml,
// self-hosting/coolify.yml and .github/smoke/docker-compose.yml name
// `packages/db` instead.

import '@openpanel/db/scripts/migrate-code';
