import path from 'path';
import arg from 'arg';
import { glob } from 'glob';

import { importFiles } from './importer';

export default async function importer() {
  const args = arg(
    {
      '--glob': String,
      '--api-url': String,
      '--client-id': String,
      '--client-secret': String,
      '--dry-run': Boolean,
      '--from': Number,
      '--to': Number,
    },
    {
      permissive: true,
    }
  );

  if (!args['--glob']) {
    throw new Error('Missing --glob argument');
  }

  if (!args['--client-id']) {
    throw new Error('Missing --client-id argument');
  }

  if (!args['--client-secret']) {
    throw new Error('Missing --client-secret argument');
  }

  const cwd = process.cwd();

  const fileMatcher = path.resolve(cwd, args['--glob']);
  const allFiles = await glob([fileMatcher], { root: '/' });
  allFiles.sort((a, b) => a.localeCompare(b));

  const files = allFiles.slice(
    args['--from'] ?? 0,
    args['--to'] ?? Number.MAX_SAFE_INTEGER
  );

  if (args['--dry-run']) {
    files.forEach((file, index) => {
      console.log(`Would import (index: ${index}): ${file}`);
    });
    return;
  }

  return importFiles({
    files,
    clientId: args['--client-id'],
    clientSecret: args['--client-secret'],
    apiUrl: args['--api-url'] ?? 'https://api.openpanel.dev',
  });
}
