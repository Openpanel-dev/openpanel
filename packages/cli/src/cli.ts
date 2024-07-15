import arg from 'arg';

import importer from './importer';

function cli() {
  const args = arg(
    {
      '--help': Boolean,
    },
    {
      permissive: true,
    }
  );

  const [command] = args._;

  switch (command) {
    case 'import': {
      return importer();
    }
  }
}

cli();
