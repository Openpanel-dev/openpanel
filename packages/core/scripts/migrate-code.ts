// Forwards to `@openpanel/db`'s code migrations: the shipped compose files and
// the Coolify template still run `cd /app/packages/core && bun
// scripts/migrate-code.ts`. Delete once self-hosting/docker-compose.template.yml,
// self-hosting/coolify.yml and .github/smoke/docker-compose.yml name
// `packages/db` instead.

import '@openpanel/db/scripts/migrate-code';
