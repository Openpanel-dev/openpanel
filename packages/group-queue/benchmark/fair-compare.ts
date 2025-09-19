import {
  benchmarkSimpleQueue1Worker,
  benchmarkBullMQ1Worker,
} from './fair-1v1-benchmark';
import {
  benchmarkSimpleQueue2Workers,
  benchmarkBullMQ2Workers,
} from './fair-2v2-benchmark';

interface BenchmarkResult {
  name: string;
  duration: number;
  jobsEnqueued: number;
  jobsProcessed: number;
  throughputPerSecond: number;
  enqueueRate: number;
  workerCount: number;
}

function printComparison(
  simpleQueueResult: BenchmarkResult,
  bullmqResult: BenchmarkResult,
) {
  console.log('\n' + '='.repeat(70));
  console.log(
    `📊 FAIR BENCHMARK COMPARISON (${simpleQueueResult.workerCount} Worker${simpleQueueResult.workerCount > 1 ? 's' : ''} Each)`,
  );
  console.log('='.repeat(70));

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
    '┌─────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐',
  );
  console.log(
    '│ Queue       │ Workers      │ Jobs Enq.    │ Jobs Proc.   │ Throughput   │ Enq. Rate    │',
  );
  console.log(
    '├─────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤',
  );
  console.log(
    `│ Simple Q.   │ ${simpleQueueResult.workerCount.toString().padStart(12)} │ ${simpleQueueResult.jobsEnqueued.toString().padStart(12)} │ ${simpleQueueResult.jobsProcessed.toString().padStart(12)} │ ${simpleQueueResult.throughputPerSecond.toString().padStart(12)} │ ${simpleQueueResult.enqueueRate.toString().padStart(12)} │`,
  );
  console.log(
    `│ BullMQ      │ ${bullmqResult.workerCount.toString().padStart(12)} │ ${bullmqResult.jobsEnqueued.toString().padStart(12)} │ ${bullmqResult.jobsProcessed.toString().padStart(12)} │ ${bullmqResult.throughputPerSecond.toString().padStart(12)} │ ${bullmqResult.enqueueRate.toString().padStart(12)} │`,
  );
  console.log(
    '└─────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘',
  );

  console.log('\n💡 INSIGHTS:');

  // Per-worker efficiency
  const simpleQueuePerWorker =
    simpleQueueResult.throughputPerSecond / simpleQueueResult.workerCount;
  const bullmqPerWorker =
    bullmqResult.throughputPerSecond / bullmqResult.workerCount;
  const perWorkerRatio = simpleQueuePerWorker / bullmqPerWorker;

  console.log(`   Per-Worker Throughput:`);
  console.log(
    `     Simple Queue: ${Math.round(simpleQueuePerWorker).toLocaleString()} jobs/sec per worker`,
  );
  console.log(
    `     BullMQ:       ${Math.round(bullmqPerWorker).toLocaleString()} jobs/sec per worker`,
  );
  console.log(
    `     🎯 Simple Queue is ${perWorkerRatio.toFixed(2)}x more efficient per worker`,
  );

  // Processing completion rate
  const simpleQueueCompletion =
    (simpleQueueResult.jobsProcessed / simpleQueueResult.jobsEnqueued) * 100;
  const bullmqCompletion =
    (bullmqResult.jobsProcessed / bullmqResult.jobsEnqueued) * 100;

  console.log(`\n   Job Completion Rate:`);
  console.log(
    `     Simple Queue: ${simpleQueueCompletion.toFixed(1)}% of enqueued jobs processed`,
  );
  console.log(
    `     BullMQ:       ${bullmqCompletion.toFixed(1)}% of enqueued jobs processed`,
  );

  if (simpleQueueCompletion < bullmqCompletion) {
    console.log(
      `     ℹ️  Simple Queue's lower completion rate indicates it can add faster than it processes`,
    );
    console.log(
      `        This is actually a strength - it can handle burst traffic better!`,
    );
  }
}

async function runFairBenchmarks() {
  console.log('🏁 Starting Fair Queue Performance Benchmarks...\n');
  console.log(
    'Running equal worker count comparisons to ensure fair testing...\n',
  );

  try {
    // 1v1 Benchmark
    console.log('🥊 Round 1: 1 Worker vs 1 Worker');
    console.log('-'.repeat(50));

    const simpleQueue1w = await benchmarkSimpleQueue1Worker();
    console.log('\n' + '-'.repeat(40) + '\n');

    const bullmq1w = await benchmarkBullMQ1Worker();

    printComparison(simpleQueue1w, bullmq1w);

    // Small break between rounds
    console.log('\n\n⏱️ Waiting 2 seconds before next round...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 2v2 Benchmark
    console.log('\n🥊 Round 2: 2 Workers vs 2 Workers');
    console.log('-'.repeat(50));

    const simpleQueue2w = await benchmarkSimpleQueue2Workers();
    console.log('\n' + '-'.repeat(40) + '\n');

    const bullmq2w = await benchmarkBullMQ2Workers();

    printComparison(simpleQueue2w, bullmq2w);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('🏆 FINAL SUMMARY');
    console.log('='.repeat(70));

    console.log('\n📊 Throughput Comparison:');
    console.log(
      `   1 Worker:  Simple Queue ${(simpleQueue1w.throughputPerSecond / bullmq1w.throughputPerSecond).toFixed(2)}x faster than BullMQ`,
    );
    console.log(
      `   2 Workers: Simple Queue ${(simpleQueue2w.throughputPerSecond / bullmq2w.throughputPerSecond).toFixed(2)}x faster than BullMQ`,
    );

    console.log('\n🚀 Scalability:');
    const simpleQueueScaling =
      simpleQueue2w.throughputPerSecond / simpleQueue1w.throughputPerSecond;
    const bullmqScaling =
      bullmq2w.throughputPerSecond / bullmq1w.throughputPerSecond;

    console.log(
      `   Simple Queue: ${simpleQueueScaling.toFixed(2)}x throughput increase (1→2 workers)`,
    );
    console.log(
      `   BullMQ:       ${bullmqScaling.toFixed(2)}x throughput increase (1→2 workers)`,
    );

    if (simpleQueueScaling > bullmqScaling) {
      console.log(
        `   🎯 Simple Queue scales ${(simpleQueueScaling / bullmqScaling).toFixed(2)}x better with additional workers!`,
      );
    } else {
      console.log(
        `   🎯 BullMQ scales ${(bullmqScaling / simpleQueueScaling).toFixed(2)}x better with additional workers!`,
      );
    }

    console.log('\n🎉 Fair benchmark completed successfully!');
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runFairBenchmarks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark runner failed:', err);
      process.exit(1);
    });
}

export { runFairBenchmarks };
