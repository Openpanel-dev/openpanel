import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';

import sdkPkg from '../../packages/sdk/package.json';
import typesPkg from '../../packages/types/package.json';

const workspacePath = (relativePath: string) =>
  path.resolve(__dirname, '../../', relativePath);

function savePackageJson(absPath: string, data: Record<string, any>) {
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf-8');
}

function exit(message: string, error?: unknown) {
  console.log(`❌ ${message}`);
  if (error instanceof Error) {
    console.log(`Error: ${error.message}`);
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
  };

  try {
    savePackageJson(workspacePath('./packages/sdk/package.json'), {
      ...sdkPkg,
      ...properties,
      dependencies: Object.entries(sdkPkg.dependencies).reduce(
        (acc, [depName, depVersion]) => ({
          ...acc,
          [depName]: depName.startsWith('@mixan') ? version : depVersion,
        }),
        {}
      ),
    });

    savePackageJson(workspacePath('./packages/types/package.json'), {
      ...typesPkg,
      ...properties,
    });
  } catch (error) {
    exit('Update JSON files', error);
  }

  console.log('✅ Update JSON files');

  try {
    execSync('pnpm dlx tsup', {
      cwd: workspacePath('./packages/sdk'),
    });
    execSync('pnpm dlx tsup', {
      cwd: workspacePath('./packages/types'),
    });
  } catch (error) {
    exit('Failed build packages', error);
  }

  console.log('✅ Built packages');

  try {
    execSync('npm publish --access=public', {
      cwd: './packages/sdk',
    });

    execSync('npm publish --access=public', {
      cwd: './packages/types',
    });
  } catch (error) {
    exit('Failed publish packages', error);
  }

  console.log('✅ All done!');
}

main();
