import pkg from '../package.json' with { type: 'json' };

// Release builds are stamped at compile time
// (`bun build --define OPENPANEL_RELEASE_VERSION='"3.1.4"'`); anything else,
// including `bun src/main.ts`, is a dev build.
declare const OPENPANEL_RELEASE_VERSION: string | undefined;

export const RELEASE_VERSION: string | null =
  typeof OPENPANEL_RELEASE_VERSION === 'string'
    ? OPENPANEL_RELEASE_VERSION
    : null;

export const VERSION: string = RELEASE_VERSION ?? `${pkg.version}-dev`;
