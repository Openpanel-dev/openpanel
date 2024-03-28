import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import arg from 'arg';
import semver from 'semver';

const sdkPackages = ['sdk', 'react-native', 'web', 'nextjs'];

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

function checkUncommittedChanges() {
  try {
    const changedFiles = execSync('git ls-files --exclude-standard --others')
      .toString()
      .trim();
    if (changedFiles !== '') {
      throw new Error('Uncommitted changes');
    }
    execSync('git diff HEAD --exit-code');
    console.log('✅ No uncommitted changes');
  } catch (error) {
    exit('Uncommitted changes', error);
  }
}

function main() {
  const args = arg({
    // Types
    '--version': String,
    '--test': Boolean,
    '--skip-git': Boolean,
    // Aliases
    '-v': '--version',
  });

  if (!args['--skip-git']) {
    checkUncommittedChanges();
  }

  const version = args['--version'];
  const test = args['--test'];

  if (version && !semver.valid(version)) {
    return console.error('Version is not valid');
  }

  try {
    for (const name of sdkPackages) {
      const properties: Record<string, unknown> = {
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

      // Not sure if I even should have type: module for any sdk
      if (name === 'nextjs') {
        delete properties.type;
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkgJson = require(
        workspacePath(`./packages/sdks/${name}/package.json`)
      );
      savePackageJson(workspacePath(`./packages/sdks/${name}/package.json`), {
        ...pkgJson,
        ...properties,
        dependencies: Object.entries(pkgJson.dependencies).reduce(
          (acc, [depName, depVersion]) => ({
            ...acc,
            [depName]: depName.startsWith('@openpanel') ? version : depVersion,
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
    for (const name of sdkPackages) {
      execSync('pnpm build', {
        cwd: workspacePath(`./packages/sdks/${name}`),
      });
    }
  } catch (error) {
    exit('Failed build packages', error);
  }

  console.log('✅ Built packages');

  if (!test) {
    try {
      for (const name of sdkPackages) {
        execSync('npm publish --access=public', {
          cwd: workspacePath(`./packages/sdks/${name}`),
        });
      }
    } catch (error) {
      exit('Failed publish packages', error);
    }
  }

  console.log('✅ All done!');
}

main();
