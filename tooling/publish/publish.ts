import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { join, resolve } from 'node:path';
import arg from 'arg';
import type { ReleaseType } from 'semver';
import semver, { RELEASE_TYPES } from 'semver';

// Types
interface PackageJson {
  name: string;
  version: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
  config?: {
    transformPackageJson?: boolean;
    transformEnvs: boolean;
  };
}

interface PackageInfo extends PackageJson {
  nextVersion: string;
  localPath: string;
}

interface PublishConfig {
  registry: string;
  clear: boolean;
}

// Utility functions
const workspacePath = (relativePath: string) =>
  resolve(__dirname, '../../', relativePath);

const savePackageJson = (absPath: string, data: PackageJson) => {
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), 'utf-8');
  execSync(`npx biome format ${absPath} --fix`);
};

const exit = (message: string, error?: unknown) => {
  console.error(`\n\n❌ ${message}`);
  if (error) console.error('Error:', error);
  process.exit(1);
};

const checkUncommittedChanges = () => {
  try {
    const uncommittedFiles = execSync('git status --porcelain')
      .toString()
      .trim();
    if (uncommittedFiles) throw new Error('Uncommitted changes detected');
    console.log('✅ No uncommitted changes');
  } catch (error) {
    exit('Uncommitted changes', error);
  }
};

const getNextVersion = (version: string, type: ReleaseType): string => {
  const nextVersion = semver.inc(version, type);
  if (!nextVersion) throw new Error('Invalid version');
  return type.startsWith('pre')
    ? nextVersion.replace(/-.*$/, '-rc')
    : nextVersion;
};

// Core functions
const loadPackages = (
  releaseType: ReleaseType,
): Record<string, PackageInfo> => {
  const sdksPath = workspacePath('./packages/sdks');
  const sdks = fs
    .readdirSync(sdksPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith('.'))
    .map((dirent) => dirent.name);

  return Object.fromEntries(
    sdks.map((sdk) => {
      const pkgPath = join(sdksPath, sdk, 'package.json');
      const pkgJson = JSON.parse(
        fs.readFileSync(pkgPath, 'utf-8'),
      ) as PackageJson;
      const version = pkgJson.version.replace(/-local$/, '');
      return [
        pkgJson.name,
        {
          ...pkgJson,
          version: version,
          nextVersion: getNextVersion(version, releaseType),
          localPath: `./packages/sdks/${sdk}`,
        },
      ];
    }),
  );
};

const findDependents = (
  packages: Record<string, PackageInfo>,
  targetName: string,
): string[] => {
  const dependents = new Set([targetName]);
  const findDeps = (name: string) => {
    for (const [pkgName, pkg] of Object.entries(packages)) {
      if (pkg.dependencies?.[name] && !dependents.has(pkgName)) {
        dependents.add(pkgName);
        findDeps(pkgName);
      }
    }
  };
  findDeps(targetName);
  return Array.from(dependents);
};

const updatePackageJsonForRelease = (
  packages: Record<string, PackageInfo>,
  name: string,
  dependents: string[],
): void => {
  const { nextVersion, localPath, ...restPkgJson } = packages[name]!;
  let newPkgJson: PackageJson = {
    ...restPkgJson,
    private: false,
    type: 'module',
    version: nextVersion,
    dependencies: Object.fromEntries(
      Object.entries(restPkgJson.dependencies || {}).map(
        ([depName, depVersion]) => [
          depName,
          dependents.includes(depName)
            ? packages[depName]?.nextVersion ||
              depVersion.replace(/-local$/, '').replace(/^workspace:/, '')
            : depVersion.replace(/-local$/, '').replace(/^workspace:/, ''),
        ],
      ),
    ),
  };

  if (packages[name]!.config?.transformPackageJson !== false) {
    newPkgJson = {
      ...newPkgJson,
      main: './dist/index.js',
      module: './dist/index.mjs',
      types: './dist/index.d.ts',
      files: ['dist'],
      exports: restPkgJson.exports ?? {
        '.': {
          import: './dist/index.js',
          require: './dist/index.cjs',
          types: './dist/index.d.ts',
        },
        ...(name === '@openpanel/nextjs'
          ? {
              './server': {
                import: './dist/server.js',
                require: './dist/server.cjs',
                types: './dist/server.d.ts',
              },
            }
          : {}),
      },
    };
  }

  savePackageJson(workspacePath(`${localPath}/package.json`), newPkgJson);
  packages[name]!.dependencies = newPkgJson.dependencies;
};

const searchAndReplace = (path: string, search: RegExp, replace: string) => {
  const files = fs.readdirSync(path);
  for (const file of files) {
    const fullpath = join(path, file);
    if (file === 'node_modules') {
      continue;
    }
    if (file.includes('.')) {
      const content = fs.readFileSync(fullpath, {
        encoding: 'utf-8',
      });

      const match = content.match(search);
      if (match) {
        console.log(`✏️ Will replace ${search} with ${replace} in ${file}`);
        const newContent = content.replaceAll(search, replace);
        fs.writeFileSync(fullpath, newContent, {
          encoding: 'utf-8',
        });
      }
    } else {
      searchAndReplace(fullpath, search, replace);
    }
  }
};

const transformPackages = (
  packages: Record<string, PackageInfo>,
  dependents: string[],
): void => {
  for (const dep of dependents) {
    const pkg = packages[dep];
    if (pkg && pkg.config?.transformEnvs === true) {
      const currentVersion = pkg.version;
      const nextVersion = pkg.nextVersion;
      searchAndReplace(
        workspacePath(pkg.localPath),
        new RegExp(`${currentVersion}`, 'g'),
        nextVersion,
      );
    }
  }
};

const buildPackages = (
  packages: Record<string, PackageInfo>,
  dependents: string[],
): void => {
  const versionEnvs = dependents.map((dep) => {
    const envName = dep
      .replace(/@openpanel\//g, '')
      .toUpperCase()
      .replace(/[/-]/g, '_');
    return `--env.${envName}_VERSION=${packages[dep]!.nextVersion}`;
  });

  for (const dep of dependents) {
    if (!packages[dep]?.scripts?.build) {
      console.log(`🔨 Skipping build for ${dep}`);
      continue;
    }
    console.log(`🔨 Building ${dep}`);
    const cmd = `pnpm build ${versionEnvs.join(' ')}`;
    console.log(`  Running: ${cmd}`);
    execSync(cmd, {
      cwd: workspacePath(packages[dep]!.localPath),
    });
  }
};

const publishPackages = (
  packages: Record<string, PackageInfo>,
  dependents: string[],
  config: PublishConfig,
): void => {
  if (config.clear) {
    execSync('rm -rf ~/.local/share/verdaccio/storage/@openpanel');
  }

  for (const dep of dependents) {
    console.log(`🚀 Publishing ${dep} to ${config.registry}`);
    execSync(`npm publish --access=public --registry ${config.registry}`, {
      cwd: workspacePath(packages[dep]!.localPath),
    });

    if (dep === '@openpanel/web') {
      execSync(
        `cp ${workspacePath('packages/sdks/web/dist/src/tracker.global.js')} ${workspacePath('./apps/public/public/op1.js')}`,
      );
    }
  }
};

const restoreAndUpdateLocal = (
  packages: Record<string, PackageInfo>,
  dependents: string[],
): void => {
  const filesToRestore = dependents
    .map((dep) => join(workspacePath(packages[dep]!.localPath), 'package.json'))
    .join(' ');

  execSync(`git checkout ${filesToRestore}`);

  for (const dep of dependents) {
    const { nextVersion, localPath, ...restPkgJson } = packages[dep]!;
    console.log(`🚀 Updating ${dep} (${nextVersion}-local)`);

    const updatedPkgJson: PackageJson = {
      ...restPkgJson,
      version: `${nextVersion}-local`,
      dependencies: Object.fromEntries(
        Object.entries(restPkgJson.dependencies || {}).map(
          ([depName, depVersion]) => [
            depName,
            dependents.includes(depName)
              ? `workspace:${packages[depName]!.nextVersion}-local`
              : packages[depName]
                ? `workspace:${packages[depName]!.version}-local`
                : depVersion,
          ],
        ),
      ),
      devDependencies: Object.fromEntries(
        Object.entries(restPkgJson.devDependencies || {}).map(
          ([depName, depVersion]) => [
            depName,
            dependents.includes(depName)
              ? `${packages[depName]!.nextVersion}-local`
              : packages[depName]
                ? `${packages[depName]!.version}-local`
                : depVersion,
          ],
        ),
      ),
    };

    savePackageJson(workspacePath(`${localPath}/package.json`), updatedPkgJson);
  }
};

function main() {
  // Main execution
  const args = arg({
    '--name': String,
    '--publish': Boolean,
    '--npm': Boolean,
    '--skip-git': Boolean,
    '--type': String,
    '--clear': Boolean,
  });

  if (!args['--skip-git']) {
    checkUncommittedChanges();
  }

  if (!args['--name']) {
    return exit('--name is required');
  }

  if (!RELEASE_TYPES.includes(args['--type'] as ReleaseType)) {
    return exit(
      `Invalid release type. Valid types are: ${RELEASE_TYPES.join(', ')}`,
    );
  }

  const originalPackages = loadPackages(args['--type'] as ReleaseType);
  const packages = loadPackages(args['--type'] as ReleaseType);
  const target = packages[args['--name']];

  if (!target) {
    return exit('Selected package does not exist');
  }

  const dependents = findDependents(packages, target.name);

  for (const dep of dependents) {
    console.log(
      `📦 ${dep} · Old Version: ${packages[dep]!.version} · Next Version: ${packages[dep]!.nextVersion}`,
    );
    updatePackageJsonForRelease(packages, dep, dependents);
  }

  transformPackages(packages, dependents);

  buildPackages(packages, dependents);

  if (args['--publish']) {
    const config: PublishConfig = {
      registry: args['--npm']
        ? 'https://registry.npmjs.org'
        : 'http://localhost:4873',
      clear: args['--clear'] || false,
    };

    publishPackages(packages, dependents, config);
    restoreAndUpdateLocal(originalPackages, dependents);
  }

  console.log('✅ All done!');
}

main();
