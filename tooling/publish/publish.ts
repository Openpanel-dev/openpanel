/* eslint-disable @typescript-eslint/no-var-requires */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

import typesPkg from '../../packages/types/package.json';

const sdkPackages = ['sdk', 'sdk-native', 'sdk-web'];
// const sdkPackages = ['sdk'];

const workspacePath = (relativePath: string) =>
  path.resolve(__dirname, '../../', relativePath);

function savePackageJson(absPath: string, data: Record<string, any>) {
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf-8');
}

function exit(message: string, error?: unknown) {
  console.log(`❌ ${message}`);
  if (error instanceof Error) {
    console.log(`Error: ${error.message}`);
    console.log(error);
  } else if (typeof error === 'string') {
    console.log(`Error: ${error}`);
  }
  process.exit(1);
}

function main() {
  const [version] = process.argv.slice(2);

  if (!version) {
    return console.error('Missing version');
  }

  if (!semver.valid(version)) {
    return console.error('Version is not valid');
  }

  const properties = {
    private: false,
    version,
    type: 'module',
    main: './dist/index.js',
    module: './dist/index.mjs',
    types: './dist/index.d.ts',
    files: ['dist'],
    exports: {
      import: './dist/index.js',
      require: './dist/index.cjs',
    },
  };

  try {
    savePackageJson(workspacePath('./packages/types/package.json'), {
      ...typesPkg,
      ...properties,
    });

    for (const name of sdkPackages) {
      const pkgJson = require(workspacePath(`./packages/${name}/package.json`));
      savePackageJson(workspacePath(`./packages/${name}/package.json`), {
        ...pkgJson,
        ...properties,
        dependencies: Object.entries(pkgJson.dependencies).reduce(
          (acc, [depName, depVersion]) => ({
            ...acc,
            [depName]: depName.startsWith('@mixan') ? version : depVersion,
          }),
          {}
        ),
      });
    }
  } catch (error) {
    exit('Update JSON files', error);
  }

  console.log('✅ Update JSON files');

  try {
    execSync('pnpm build', {
      cwd: workspacePath(`./packages/types`),
    });

    for (const name of sdkPackages) {
      execSync('pnpm build', {
        cwd: workspacePath(`./packages/${name}`),
      });
    }
  } catch (error) {
    exit('Failed build packages', error);
  }

  console.log('✅ Built packages');

  try {
    for (const name of sdkPackages) {
      execSync('npm publish --access=public', {
        cwd: workspacePath(`./packages/${name}`),
      });
    }

    execSync('npm publish --access=public', {
      cwd: workspacePath('./packages/types'),
    });
  } catch (error) {
    exit('Failed publish packages', error);
  }

  console.log('✅ All done!');
}

main();
