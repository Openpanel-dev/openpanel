// The marketing site deploys on its own and ships nothing in the release
// images, so a commit that only touches it neither bumps the version nor
// appears in the release notes. A commit that also changes product code still
// counts in full.
const EXCLUDED_PATHS = ['apps/public'];

// `top` anchors the pathspec at the repository root, whatever the cwd is.
export const RELEASE_PATHSPEC = [
  '--',
  ':(top)',
  ...EXCLUDED_PATHS.map((path) => `:(top,exclude)${path}`),
];
