import { benchmarkSimpleQueue } from './simple-queue-benchmark';
import { benchmarkSimpleQueueOptimized } from './simple-queue-optimized';
import { benchmarkBullMQ } from './bullmq-benchmark';

interface BenchmarkResult {
  name: string;
  duration: number;
  jobsEnqueued: number;
  jobsProcessed: number;
  throughputPerSecond: number;
  enqueueRate: number;
  workerCount?: number;
}

function printDetailedComparison(
  originalResult: BenchmarkResult,
  optimizedResult: BenchmarkResult,
  bullmqResult: BenchmarkResult,
) {
  console.log('\n' + '='.repeat(80));
  console.log('🔬 DETAILED PERFORMANCE COMPARISON');
  console.log('='.repeat(80));

  console.log('\n📈 THROUGHPUT COMPARISON (Jobs Processed/Second):');
  console.log(
    `   Simple Queue (Original):  ${originalResult.throughputPerSecond.toLocaleString().padStart(8)} jobs/sec`,
  );
  console.log(
    `   Simple Queue (Optimized): ${optimizedResult.throughputPerSecond.toLocaleString().padStart(8)} jobs/sec`,
  );
  console.log(
    `   BullMQ:                   ${bullmqResult.throughputPerSecond.toLocaleString().padStart(8)} jobs/sec`,
  );

  const improvementRatio =
    optimizedResult.throughputPerSecond / originalResult.throughputPerSecond;
  const bullmqRatio =
    optimizedResult.throughputPerSecond / bullmqResult.throughputPerSecond;

  console.log(`\n🚀 PERFORMANCE IMPROVEMENTS:`);
  console.log(
    `   Optimization gained: ${improvementRatio.toFixed(2)}x improvement (${((improvementRatio - 1) * 100).toFixed(1)}% faster)`,
  );

  if (bullmqRatio > 1) {
    console.log(
      `   🏆 Optimized Simple Queue is now ${bullmqRatio.toFixed(2)}x faster than BullMQ!`,
    );
  } else {
    console.log(
      `   📊 BullMQ still ${(1 / bullmqRatio).toFixed(2)}x faster (gap reduced from ${(bullmqResult.throughputPerSecond / originalResult.throughputPerSecond).toFixed(2)}x to ${(1 / bullmqRatio).toFixed(2)}x)`,
    );
  }

  console.log('\n📤 ENQUEUE RATE COMPARISON:');
  console.log(
    `   Simple Queue (Original):  ${originalResult.enqueueRate.toLocaleString().padStart(8)} jobs/sec`,
  );
  console.log(
    `   Simple Queue (Optimized): ${optimizedResult.enqueueRate.toLocaleString().padStart(8)} jobs/sec`,
  );
  console.log(
    `   BullMQ:                   ${bullmqResult.enqueueRate.toLocaleString().padStart(8)} jobs/sec`,
  );

  console.log('\n📊 PROCESSING EFFICIENCY:');
  const originalEfficiency =
    (originalResult.jobsProcessed / originalResult.jobsEnqueued) * 100;
  const optimizedEfficiency =
    (optimizedResult.jobsProcessed / optimizedResult.jobsEnqueued) * 100;
  const bullmqEfficiency =
    (bullmqResult.jobsProcessed / bullmqResult.jobsEnqueued) * 100;

  console.log(`   Simple Queue (Original):  ${originalEfficiency.toFixed(1)}%`);
  console.log(
    `   Simple Queue (Optimized): ${optimizedEfficiency.toFixed(1)}%`,
  );
  console.log(`   BullMQ:                   ${bullmqEfficiency.toFixed(1)}%`);

  console.log('\n🔧 OPTIMIZATION TECHNIQUES APPLIED:');
  console.log('   ✅ Removed expensive expired job cleanup from reserve path');
  console.log('   ✅ Replaced JSON serialization with pipe-delimited strings');
  console.log('   ✅ Added pub/sub notifications to reduce polling overhead');
  console.log('   ✅ Used multiple workers for better parallelism');
  console.log('   ✅ Removed verbose Redis event logging');
  console.log('   ✅ Optimized Lua scripts for better Redis performance');
  console.log('   ✅ Added periodic cleanup instead of per-operation cleanup');

  console.log('\n📋 DETAILED RESULTS TABLE:');
  console.log(
    '┌─────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────┐',
  );
  console.log(
    '│ Queue               │ Jobs Enq.    │ Jobs Proc.   │ Throughput   │ Enq. Rate    │ Workers  │',
  );
  console.log(
    '├─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────┤',
  );
  console.log(
    `│ Simple Q. (Orig.)   │ ${originalResult.jobsEnqueued.toString().padStart(12)} │ ${originalResult.jobsProcessed.toString().padStart(12)} │ ${originalResult.throughputPerSecond.toString().padStart(12)} │ ${originalResult.enqueueRate.toString().padStart(12)} │ ${(originalResult.workerCount || 1).toString().padStart(8)} │`,
  );
  console.log(
    `│ Simple Q. (Opt.)    │ ${optimizedResult.jobsEnqueued.toString().padStart(12)} │ ${optimizedResult.jobsProcessed.toString().padStart(12)} │ ${optimizedResult.throughputPerSecond.toString().padStart(12)} │ ${optimizedResult.enqueueRate.toString().padStart(12)} │ ${(optimizedResult.workerCount || 1).toString().padStart(8)} │`,
  );
  console.log(
    `│ BullMQ              │ ${bullmqResult.jobsEnqueued.toString().padStart(12)} │ ${bullmqResult.jobsProcessed.toString().padStart(12)} │ ${bullmqResult.throughputPerSecond.toString().padStart(12)} │ ${bullmqResult.enqueueRate.toString().padStart(12)} │ ${(bullmqResult.workerCount || 10).toString().padStart(8)} │`,
  );
  console.log(
    '└─────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────┘',
  );
}

async function runOptimizedComparison() {
  console.log('🏁 Starting Comprehensive Queue Performance Analysis...\n');

  try {
    console.log(
      'Running benchmarks sequentially to avoid resource contention...\n',
    );

    console.log('1️⃣  Testing Original Simple Queue Implementation...');
    const originalResult = await benchmarkSimpleQueue();
    console.log('\n' + '-'.repeat(50) + '\n');

    console.log('2️⃣  Testing Optimized Simple Queue Implementation...');
    const optimizedResult = await benchmarkSimpleQueueOptimized();
    console.log('\n' + '-'.repeat(50) + '\n');

    console.log('3️⃣  Testing BullMQ for Comparison...');
    const bullmqResult = await benchmarkBullMQ();

    printDetailedComparison(originalResult, optimizedResult, bullmqResult);

    console.log('\n🎯 Comprehensive analysis completed successfully!');
  } catch (error) {
    console.error('❌ Benchmark comparison failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runOptimizedComparison()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark runner failed:', err);
      process.exit(1);
    });
}

export { runOptimizedComparison };
