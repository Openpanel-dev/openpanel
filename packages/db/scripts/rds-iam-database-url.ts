// Prints DATABASE_URL_DIRECT (or DATABASE_URL) with a fresh RDS IAM token as
// the password, for tools that only take a URL:
//   DATABASE_URL_DIRECT="$(bun ./scripts/rds-iam-database-url.ts)" prisma migrate deploy
// The token is valid for new connections for 15 minutes.

import { getRdsIamDatabaseUrl } from '../src/rds-iam';

const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

process.stdout.write(await getRdsIamDatabaseUrl(databaseUrl));
