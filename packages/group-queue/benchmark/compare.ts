import { benchmarkSimpleQueue } from './simple-queue-benchmark';
import { benchmarkBullMQ } from './bullmq-benchmark';

interface BenchmarkResult {
  name: string;
  duration: number;
  jobsEnqueued: number;
  jobsProcessed: number;
  throughputPerSecond: number;
  enqueueRate: number;
}

function printComparison(
  simpleQueueResult: BenchmarkResult,
  bullmqResult: BenchmarkResult,
) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 BENCHMARK COMPARISON');
  console.log('='.repeat(60));

  console.log('\n📈 THROUGHPUT (Jobs Processed/Second):');
  console.log(
    `   Simple Queue: ${simpleQueueResult.throughputPerSecond.toLocaleString()} jobs/sec`,
  );
  console.log(
    `   BullMQ:       ${bullmqResult.throughputPerSecond.toLocaleString()} jobs/sec`,
  );

  const throughputRatio =
    simpleQueueResult.throughputPerSecond / bullmqResult.throughputPerSecond;
  if (throughputRatio > 1) {
    console.log(`   🏆 Simple Queue is ${throughputRatio.toFixed(2)}x faster!`);
  } else {
    console.log(`   🏆 BullMQ is ${(1 / throughputRatio).toFixed(2)}x faster!`);
  }

  console.log('\n📤 ENQUEUE RATE (Jobs Enqueued/Second):');
  console.log(
    `   Simple Queue: ${simpleQueueResult.enqueueRate.toLocaleString()} jobs/sec`,
  );
  console.log(
    `   BullMQ:       ${bullmqResult.enqueueRate.toLocaleString()} jobs/sec`,
  );

  const enqueueRatio = simpleQueueResult.enqueueRate / bullmqResult.enqueueRate;
  if (enqueueRatio > 1) {
    console.log(
      `   🏆 Simple Queue enqueues ${enqueueRatio.toFixed(2)}x faster!`,
    );
  } else {
    console.log(
      `   🏆 BullMQ enqueues ${(1 / enqueueRatio).toFixed(2)}x faster!`,
    );
  }

  console.log('\n📋 DETAILED RESULTS:');
  console.log(
    '┌─────────────┬──────────────┬──────────────┬──────────────┬──────────────┐',
  );
  console.log(
    '│ Queue       │ Jobs Enq.    │ Jobs Proc.   │ Throughput   │ Enq. Rate    │',
  );
  console.log(
    '├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┤',
  );
  console.log(
    `│ Simple Q.   │ ${simpleQueueResult.jobsEnqueued.toString().padStart(12)} │ ${simpleQueueResult.jobsProcessed.toString().padStart(12)} │ ${simpleQueueResult.throughputPerSecond.toString().padStart(12)} │ ${simpleQueueResult.enqueueRate.toString().padStart(12)} │`,
  );
  console.log(
    `│ BullMQ      │ ${bullmqResult.jobsEnqueued.toString().padStart(12)} │ ${bullmqResult.jobsProcessed.toString().padStart(12)} │ ${bullmqResult.throughputPerSecond.toString().padStart(12)} │ ${bullmqResult.enqueueRate.toString().padStart(12)} │`,
  );
  console.log(
    '└─────────────┴──────────────┴──────────────┴──────────────┴──────────────┘',
  );

  console.log('\n💡 INSIGHTS:');

  const processingEfficiency =
    (simpleQueueResult.jobsProcessed / simpleQueueResult.jobsEnqueued) * 100;
  const bullmqEfficiency =
    (bullmqResult.jobsProcessed / bullmqResult.jobsEnqueued) * 100;

  console.log(
    `   Simple Queue Processing Efficiency: ${processingEfficiency.toFixed(1)}%`,
  );
  console.log(
    `   BullMQ Processing Efficiency: ${bullmqEfficiency.toFixed(1)}%`,
  );

  if (processingEfficiency > bullmqEfficiency) {
    console.log(
      `   ✅ Simple Queue processed a higher percentage of enqueued jobs`,
    );
  } else {
    console.log(`   ✅ BullMQ processed a higher percentage of enqueued jobs`);
  }
}

async function runBenchmarks() {
  console.log('🏁 Starting Queue Performance Benchmarks...\n');

  try {
    console.log(
      'Running benchmarks sequentially to avoid resource contention...\n',
    );

    const simpleQueueResult = await benchmarkSimpleQueue();
    console.log('\n' + '-'.repeat(40) + '\n');

    const bullmqResult = await benchmarkBullMQ();

    printComparison(simpleQueueResult, bullmqResult);

    console.log('\n🎯 Benchmark completed successfully!');
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBenchmarks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark runner failed:', err);
      process.exit(1);
    });
}

export { runBenchmarks };
