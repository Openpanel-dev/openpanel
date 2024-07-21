import path from 'path';
import arg from 'arg';

import { importFiles } from './importer';

export default function importer() {
  const args = arg(
    {
      '--glob': String,
    },
    {
      permissive: true,
    }
  );

  if (!args['--glob']) {
    throw new Error('Missing --glob argument');
  }

  const cwd = process.cwd();

  const filePath = path.resolve(cwd, args['--glob']);

  return importFiles(filePath);
}
