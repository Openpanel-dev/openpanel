import sdkPkg from './packages/sdk/package.json'
import typesPkg from './packages/types/package.json'
import fs from 'node:fs'
import {execSync} from 'node:child_process'
import semver from 'semver'

function savePackageJson(path: string, data: Record<string, any>) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

function main() {
  const [version] = process.argv.slice(2)
  
  if(!version) {
    return console.error('Missing version')
  }
  
  if(!semver.valid(version)) {
    return console.error('Version is not valid')
  }
  
  const properties = {
    private: false,
    version,
    type: 'module',
    main: './dist/index.js',
    module: './dist/index.mjs',
    types: './dist/index.d.ts',
    files: ['dist'],
  }

  savePackageJson('./packages/sdk/package.json', {
    ...sdkPkg,
    ...properties,
    dependencies: Object.entries(sdkPkg.dependencies).reduce(
      (acc, [depName, depVersion]) => ({
        ...acc,
        [depName]: depName.startsWith('@mixan') ? version : depVersion,
      }),
      {}
    ),
  })

  savePackageJson('./packages/types/package.json', {
    ...typesPkg,
    ...properties,
  })

  try {
    execSync('pnpm dlx tsup', {
      cwd: './packages/sdk',
    })
    execSync('pnpm dlx tsup', {
      cwd: './packages/types',
    })
  } catch(error) {
    console.log('Build failed');
    console.log(error);
    process.exit(1)
  }
  
  execSync('npm publish --access=public', {
    cwd: './packages/sdk',
  })

  execSync('npm publish --access=public', {
    cwd: './packages/types',
  })
}

main()
