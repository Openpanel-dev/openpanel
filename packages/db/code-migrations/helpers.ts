export function printBoxMessage(title: string, lines: (string | unknown)[]) {
  console.log('┌──┐');
  console.log('│');
  if (title) {
    console.log(`│  ${title}`);
    if (lines.length) {
      console.log('│');
    }
  }
  lines.forEach((line) => {
    console.log(`│  ${line}`);
  });
  console.log('│');
  console.log('└──┘');
}

export function getIsCluster() {
  const args = process.argv;
  const noClusterArg = args.includes('--no-cluster');
  if (noClusterArg) {
    return false;
  }
  return !getIsSelfHosting();
}

export function getIsSelfHosting() {
  return (
    process.env.NEXT_PUBLIC_SELF_HOSTED === 'true' || !!process.env.SELF_HOSTED
  );
}

export function getIsDry() {
  return process.argv.includes('--dry');
}
