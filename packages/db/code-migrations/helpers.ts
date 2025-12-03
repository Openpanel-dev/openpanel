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
  return (
    args.includes('--cluster') ||
    process.env.CLICKHOUSE_CLUSTER === 'true' ||
    process.env.CLICKHOUSE_CLUSTER === '1'
  );
}

export function getIsSelfHosting() {
  return process.env.SELF_HOSTED === 'true' || !!process.env.SELF_HOSTED;
}

export function getIsDry() {
  return process.argv.includes('--dry');
}
