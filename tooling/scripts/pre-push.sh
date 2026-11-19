#!/bin/sh
# Every push to main is a release, so it has to pass typecheck and tests
# locally. Feature branches get the same checks from CI on their PR.
# git passes "<local ref> <local sha> <remote ref> <remote sha>" per ref on stdin.

[ -n "$SKIP_HOOKS" ] && exit 0

pushes_main=false
while read -r _local_ref _local_sha remote_ref _remote_sha; do
  [ "$remote_ref" = "refs/heads/main" ] && pushes_main=true
done

[ "$pushes_main" = true ] || exit 0

bun run typecheck && bun run test
