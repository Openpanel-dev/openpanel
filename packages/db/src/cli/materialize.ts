#!/usr/bin/env node
import { materializeColumnsService } from '../services/materialize-columns.service';

async function main() {
  const args = process.argv.slice(2);

  const dryRun = !args.includes('--execute');
  const thresholdArg = args.find((arg) => arg.startsWith('--threshold='));
  const threshold = thresholdArg
    ? Number.parseInt(thresholdArg.split('=')[1]!)
    : 150;

  if (Number.isNaN(threshold) || threshold < 0) {
    console.error('Error: Invalid threshold value');
    process.exit(1);
  }

  console.log('Materialized Column Analyzer');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`Threshold: ${threshold}`);
  console.log('');

  try {
    const result = await materializeColumnsService.analyze({
      dryRun,
      threshold,
    });

    console.log(result.report);

    if (!dryRun && result.materialized.length > 0) {
      console.log('\n✅ Successfully materialized:');
      for (const prop of result.materialized) {
        console.log(`   - ${prop}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during analysis:', error);
    process.exit(1);
  }
}

main();
