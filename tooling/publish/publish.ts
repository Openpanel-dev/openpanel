import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import arg from 'arg';
import type { ReleaseType } from 'semver';
import semver, { RELEASE_TYPES } from 'semver';

const workspacePath = (relativePath: string) =>
  path.resolve(__dirname, '../../', relativePath);

function savePackageJson(absPath: string, data: Record<string, any>) {
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf-8');
}

function exit(message: string, error?: unknown) {
  console.log(`\n\n❌ ${message}`);
  if (error instanceof Error) {
    console.log(`Error: ${error.message}`);
    console.log(error);
  } else if (typeof error === 'string') {
    console.log(`Error: ${error}`);
  }
  console.log('\n');

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
    exit('Uncommitted changes');
  }
}

function getNextVersion(version: string, type: ReleaseType) {
  const nextVersion = semver.inc(version, type);
  if (!nextVersion) {
    throw new Error('Invalid version');
  }

  if (type.startsWith('pre')) {
    return nextVersion.replace(/-.*$/, '-beta');
  }

  return nextVersion;
}

type IPackageJson = {
  type?: string;
  name: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

type IPackageJsonWithExtra = IPackageJson & {
  nextVersion: string;
  localPath: string;
};

function main() {
  const args = arg({
    '--name': String,
    '--publish': Boolean,
    '--test': Boolean,
    '--skip-git': Boolean,
    // Semver
    '--type': String, // major, minor, patch, premajor, preminor, prepatch, or prerelease
  });

  if (!args['--skip-git']) {
    checkUncommittedChanges();
  }

  const pkgName = args['--name'];
  const type = args['--type'] as ReleaseType;
  const test = args['--test'];
  const publish = args['--publish'];
  const packages: Record<string, IPackageJsonWithExtra> = {};
  const registry = test
    ? 'http://localhost:4873'
    : 'https://registry.npmjs.org';

  if (!RELEASE_TYPES.includes(type)) {
    return exit(
      `Invalid release type. Valid types are: ${RELEASE_TYPES.join(', ')}`
    );
  }

  if (!pkgName) {
    return exit('--name is requred');
  }

  // Get all SDKs
  const sdks = fs
    .readdirSync(workspacePath('./packages/sdks'), {
      withFileTypes: true,
    })
    .filter((item) => item.isDirectory() && !item.name.match(/^[._]/))
    .map((item) => item.name);

  // Get all SDK package.json
  for (const name of sdks) {
    const pkgJson = fs.readFileSync(
      workspacePath(`./packages/sdks/${name}/package.json`),
      'utf-8'
    );
    const parsed = JSON.parse(pkgJson) as IPackageJsonWithExtra;
    parsed.nextVersion = getNextVersion(parsed.version, type);
    parsed.localPath = `./packages/sdks/${name}`;
    packages[parsed.name] = parsed;
  }

  const target = packages[pkgName];

  if (!target) {
    return exit('Selected package does not exist');
  }

  // Find if any package is dependent on the target
  const dependents: string[] = [target.name];
  function findDependents(visitPackageName: string) {
    Object.entries(packages).forEach(([_name, pkg]) => {
      if (pkg.dependencies?.[visitPackageName]) {
        dependents.push(pkg.name);
        findDependents(pkg.name);
      }
    });
  }
  findDependents(target.name);

  function updatePackageJsonForRelease(name: string) {
    const { nextVersion, localPath, ...restPkgJson } = packages[name]!;
    const newPkgJson = JSON.parse(
      JSON.stringify({
        ...restPkgJson,
        private: false,
        type: 'module',
        main: './dist/index.js',
        module: './dist/index.mjs',
        types: './dist/index.d.ts',
        files: ['dist'],
        exports: {
          import: './dist/index.js',
          require: './dist/index.cjs',
        },
        version: nextVersion,
        dependencies: Object.entries(restPkgJson.dependencies).reduce(
          (acc, [depName, depVersion]) => {
            const dep = packages[depName];
            if (!dep) {
              return { ...acc, [depName]: depVersion };
            }

            return {
              ...acc,
              [depName]: dependents.includes(depName)
                ? dep.nextVersion
                : depVersion,
            };
          },
          {}
        ),
      })
    ) as IPackageJson;

    if (name === '@openpanel/nextjs') {
      delete newPkgJson.type;
    }

    savePackageJson(workspacePath(`${localPath}/package.json`), newPkgJson);
    packages[name]!.dependencies = newPkgJson.dependencies;
  }

  dependents.forEach((dependent) => {
    console.log(
      `📦 ${dependent} · Old Version: ${packages[dependent]?.version} · Next Version: ${packages[dependent]?.nextVersion}`
    );
    updatePackageJsonForRelease(dependent);
  });

  dependents.forEach((dependent) => {
    console.log(`🔨 Building ${dependent}`);
    execSync('pnpm build', {
      cwd: workspacePath(packages[dependent]!.localPath),
    });
  });

  // Publish
  if (publish) {
    dependents.forEach((dependent) => {
      console.log(`🚀 Publishing ${dependent} to ${registry}`);
      execSync(`npm publish --access=public --registry ${registry}`, {
        cwd: workspacePath(packages[dependent]!.localPath),
      });
    });
  }

  // Restoring package.json
  const filesToRestore = dependents
    .map((dependent) => workspacePath(packages[dependent]!.localPath))
    .join(' ');

  execSync(`git checkout ${filesToRestore}`);

  // // Save new versions only 😈
  dependents.forEach((dependent) => {
    const { nextVersion, localPath, ...restPkgJson } = packages[dependent]!;
    console.log(`🚀 Saving ${dependent} (${nextVersion})`);
    savePackageJson(workspacePath(`${localPath}/package.json`), {
      ...restPkgJson,
      version: nextVersion,
    });
  });

  console.log('✅ All done!');
}

main();
