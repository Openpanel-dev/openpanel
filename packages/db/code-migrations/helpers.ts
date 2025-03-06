export function printBoxMessage(title: string, lines: (string | unknown)[]) {
  console.log('┌──┐');
  console.log('│');
  if (title) {
    console.log(`│  ${title}`);
    console.log('│');
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
  return !!process.env.SELF_HOSTED;
}
