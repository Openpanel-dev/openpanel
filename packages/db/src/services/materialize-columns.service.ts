import { type ILogger, createLogger } from '@openpanel/logger';
import { ch } from '../clickhouse/client';
import { chMigrationClient } from '../clickhouse/migration';
import { db } from '../../index';

interface PropertyUsageStats {
  property: string; // Full path: "properties.utm_source"
  propertyKey: string; // Key only: "utm_source"
  usageCount: number; // How many reports use it
  queryFrequency: number; // Estimated queries per day
  cardinality: number; // Number of unique values
  estimatedSize: number; // Estimated storage cost in bytes
  benefit: number; // Calculated benefit score
}

interface PropertyAnalysis extends PropertyUsageStats {
  skipReason?: string; // Why it wasn't materialized (if skipped)
}

interface MaterializedColumnCandidate {
  propertyKey: string;
  columnName: string;
  reason: string;
  stats: PropertyUsageStats;
}

export class MaterializeColumnsService {
  private logger: ILogger;

  // Thresholds for materialization decisions
  private readonly MIN_USAGE_COUNT = 1; // Must be used in at least 1 report
  private readonly MAX_CARDINALITY = 1000; // Don't materialize if >1000 unique values
  private readonly MIN_BENEFIT_SCORE = 20; // Minimum benefit score to justify materialization
  private readonly MAX_DAILY_MATERIALIZATIONS = 3; // Rate limit: max 3 new columns per day

  constructor() {
    this.logger = createLogger({ name: 'materialize-columns' });
  }

  /**
   * Main entry point with dry-run support
   */
  async analyze(options: {
    dryRun: boolean;
    threshold?: number;
  }): Promise<{
    candidates: MaterializedColumnCandidate[];
    allProperties: PropertyAnalysis[];
    report: string;
    materialized: string[];
  }> {
    const { dryRun, threshold = this.MIN_BENEFIT_SCORE } = options;

    this.logger.info('Starting materialized column analysis', {
      dryRun,
      threshold,
    });

    // Step 1: Get candidates and all analyzed properties
    const { candidates, allProperties } = await this.analyzeDashboardProperties(threshold);

    // Step 2: Generate report
    const report = this.generateReport(candidates, allProperties, dryRun);

    // Step 3: Execute if not dry-run
    const materialized: string[] = [];
    if (!dryRun && candidates.length > 0) {
      // Rate limiting
      const limited = candidates.slice(0, this.MAX_DAILY_MATERIALIZATIONS);
      if (limited.length < candidates.length) {
        this.logger.warn(
          `Rate limiting: Only materializing ${limited.length} of ${candidates.length} candidates`,
        );
      }

      for (const candidate of limited) {
        try {
          await this.materializeColumn(candidate);
          materialized.push(candidate.propertyKey);
        } catch (error) {
          this.logger.error(
            `Failed to materialize ${candidate.propertyKey}`,
            { error },
          );
        }
      }
    }

    return {
      candidates,
      allProperties,
      report,
      materialized,
    };
  }

  /**
   * Main analysis function: Find properties that should be materialized
   */
  private async analyzeDashboardProperties(
    threshold: number,
  ): Promise<{
    candidates: MaterializedColumnCandidate[];
    allProperties: PropertyAnalysis[];
  }> {
    // Step 1: Get all properties used in reports
    const propertyUsage = await this.getPropertyUsageFromReports();

    if (propertyUsage.length === 0) {
      this.logger.info('No properties found in reports');
      return { candidates: [], allProperties: [] };
    }

    this.logger.info(`Found ${propertyUsage.length} unique properties in reports`);

    // Step 2: Check already materialized columns from database tracking
    const existingColumns = await db.materializedColumn.findMany({
      where: { status: 'active' },
      select: { propertyKey: true },
    });
    const existingKeys = new Set(existingColumns.map((c) => c.propertyKey));

    // Step 3: Check if columns already exist in ClickHouse events table
    const clickhouseColumns = await this.getExistingClickHouseColumns();
    const clickhouseColumnNames = new Set(clickhouseColumns);

    // Separate properties into categories
    const alreadyTracked = propertyUsage.filter((p) =>
      existingKeys.has(p.propertyKey),
    );
    const alreadyExistsInClickHouse = propertyUsage.filter(
      (p) => !existingKeys.has(p.propertyKey) && clickhouseColumnNames.has(p.propertyKey),
    );
    const newProperties = propertyUsage.filter(
      (p) => !existingKeys.has(p.propertyKey) && !clickhouseColumnNames.has(p.propertyKey),
    );

    // Track all properties with their analysis
    const allProperties: PropertyAnalysis[] = [];

    // Add properties already tracked in database
    allProperties.push(
      ...alreadyTracked.map((p) => ({
        ...p,
        cardinality: 0,
        estimatedSize: 0,
        benefit: 0,
        skipReason: '✅ Already materialized (tracked)',
      })),
    );

    // Add properties that already exist as columns in ClickHouse
    allProperties.push(
      ...alreadyExistsInClickHouse.map((p) => ({
        ...p,
        cardinality: 0,
        estimatedSize: 0,
        benefit: 0,
        skipReason: '✅ Column already exists in events table',
      })),
    );

    if (newProperties.length === 0) {
      this.logger.info('No new properties to analyze (all already materialized)');
      return { candidates: [], allProperties };
    }

    this.logger.info(
      `${newProperties.length} properties not yet materialized`,
    );

    // Step 3: Enrich with ClickHouse statistics
    const enrichedStats = await Promise.all(
      newProperties.map((usage) => this.enrichWithClickHouseStats(usage)),
    );

    // Step 4: Calculate benefit scores
    const statsWithBenefit = enrichedStats.map((stats) =>
      this.calculateBenefitScore(stats),
    );

    // Step 5: Determine skip reasons and separate candidates
    const analyzed = statsWithBenefit.map((stats) => {
      const skipReason = this.getSkipReason(stats, threshold);
      return {
        ...stats,
        skipReason,
      };
    });

    allProperties.push(...analyzed);

    // Extract candidates (those without skip reason)
    const candidates = analyzed
      .filter((stat) => !stat.skipReason)
      .map((stats) => this.createCandidate(stats))
      .sort((a, b) => b.stats.benefit - a.stats.benefit);

    this.logger.info(`Identified ${candidates.length} candidates for materialization`);

    return {
      candidates,
      allProperties: allProperties.sort((a, b) => b.benefit - a.benefit), // Sort by benefit
    };
  }

  /**
   * Get existing materialized column names from ClickHouse events table
   */
  private async getExistingClickHouseColumns(): Promise<string[]> {
    try {
      const result = await ch.query({
        query: `
          SELECT name
          FROM system.columns
          WHERE database = 'default'
            AND table = 'events'
            AND default_kind = 'MATERIALIZED'
        `,
        format: 'JSONEachRow',
      });

      const data = await result.json<{ name: string }>();
      return data.map((row) => row.name);
    } catch (error) {
      this.logger.warn('Failed to get existing ClickHouse columns', { error });
      return [];
    }
  }

  /**
   * Determine why a property should be skipped
   */
  private getSkipReason(stats: PropertyUsageStats, threshold: number): string | undefined {
    if (stats.usageCount < this.MIN_USAGE_COUNT) {
      return `❌ Low usage (${stats.usageCount} reports, need ${this.MIN_USAGE_COUNT})`;
    }

    if (stats.cardinality === 0) {
      return `❌ No data found in event_property_values_mv`;
    }

    if (stats.cardinality > this.MAX_CARDINALITY) {
      return `❌ Too high cardinality (${stats.cardinality} values > ${this.MAX_CARDINALITY} limit)`;
    }

    if (stats.benefit < threshold) {
      return `❌ Benefit too low (${stats.benefit.toFixed(0)} < ${threshold} threshold)`;
    }

    return undefined; // Should be materialized
  }

  /**
   * Extract properties from reports table
   */
  private async getPropertyUsageFromReports(): Promise<
    Array<{
      property: string;
      propertyKey: string;
      usageCount: number;
      queryFrequency: number;
    }>
  > {
    const reports = await db.report.findMany({
      select: {
        breakdowns: true,
        events: true,
      },
    });

    const propertyMap = new Map<string, number>();

    for (const report of reports) {
      const properties = this.extractPropertiesFromReport(report);
      for (const prop of properties) {
        propertyMap.set(prop, (propertyMap.get(prop) || 0) + 1);
      }
    }

    // Estimate: each report queried ~10 times per day
    const ESTIMATED_QUERIES_PER_DAY = 10;

    return Array.from(propertyMap.entries()).map(([property, usageCount]) => {
      const propertyKey = property.replace('properties.', '');
      return {
        property,
        propertyKey,
        usageCount,
        queryFrequency: usageCount * ESTIMATED_QUERIES_PER_DAY,
      };
    });
  }

  /**
   * Extract property names from report JSON fields
   */
  private extractPropertiesFromReport(report: {
    breakdowns: any;
    events: any;
  }): string[] {
    const properties = new Set<string>();

    // Parse breakdowns
    try {
      const breakdowns = Array.isArray(report.breakdowns)
        ? report.breakdowns
        : [];
      for (const breakdown of breakdowns) {
        if (
          breakdown?.name &&
          typeof breakdown.name === 'string' &&
          breakdown.name.startsWith('properties.')
        ) {
          // Skip wildcards and complex expressions
          if (
            !breakdown.name.includes('*') &&
            !breakdown.name.includes('(') &&
            !breakdown.name.includes('[')
          ) {
            properties.add(breakdown.name);
          }
        }
      }
    } catch (e) {
      this.logger.warn('Failed to parse breakdowns', { error: e });
    }

    // Parse events (filters)
    try {
      const events = Array.isArray(report.events) ? report.events : [];
      for (const event of events) {
        if (event?.filters && Array.isArray(event.filters)) {
          for (const filter of event.filters) {
            if (
              filter?.name &&
              typeof filter.name === 'string' &&
              filter.name.startsWith('properties.')
            ) {
              if (
                !filter.name.includes('*') &&
                !filter.name.includes('(') &&
                !filter.name.includes('[')
              ) {
                properties.add(filter.name);
              }
            }
          }
        }
      }
    } catch (e) {
      this.logger.warn('Failed to parse event filters', { error: e });
    }

    return Array.from(properties);
  }

  /**
   * Get cardinality and size from ClickHouse using event_property_values_mv
   * This is MUCH faster than scanning the entire events table
   */
  private async enrichWithClickHouseStats(usage: {
    property: string;
    propertyKey: string;
    usageCount: number;
    queryFrequency: number;
  }): Promise<PropertyUsageStats> {
    try {
      // Use the materialized view instead of scanning events table
      const result = await ch.query({
        query: `
          SELECT
            uniqExact(property_value) as cardinality,
            avg(length(property_value)) as avg_length,
            count() as total_occurrences
          FROM event_property_values_mv
          WHERE property_key = '${usage.propertyKey}'
            AND property_value != ''
        `,
        format: 'JSONEachRow',
      });

      const data = await result.json<{
        cardinality: string;
        avg_length: string;
        total_occurrences: string;
      }>();

      const cardinality = Number(data[0]?.cardinality || 0);
      const avgLength = Number(data[0]?.avg_length || 10);
      const totalOccurrences = Number(data[0]?.total_occurrences || 0);

      // Estimate storage: avgLength × totalOccurrences
      // Note: totalOccurrences is how many times this property appears, not event count
      const estimatedSize = Math.ceil(avgLength * totalOccurrences);

      return {
        property: usage.property,
        propertyKey: usage.propertyKey,
        usageCount: usage.usageCount,
        queryFrequency: usage.queryFrequency,
        cardinality,
        estimatedSize,
        benefit: 0,
      };
    } catch (error) {
      this.logger.warn(`Failed to get stats for ${usage.property}`, { error });
      return {
        property: usage.property,
        propertyKey: usage.propertyKey,
        usageCount: usage.usageCount,
        queryFrequency: usage.queryFrequency,
        cardinality: 0,
        estimatedSize: 0,
        benefit: 0,
      };
    }
  }

  /**
   * Calculate benefit score
   */
  private calculateBenefitScore(
    stats: PropertyUsageStats,
  ): PropertyUsageStats {
    const usageScore = stats.usageCount * 10;
    const frequencyScore = Math.min(stats.queryFrequency, 1000);
    const cardinalityPenalty = Math.max(0, stats.cardinality - 100) * 0.5;
    const sizePenalty = stats.estimatedSize / 1_000_000; // Penalty in MB

    const benefit =
      usageScore + frequencyScore - cardinalityPenalty - sizePenalty;

    return {
      ...stats,
      benefit: Math.max(0, benefit),
    };
  }

  /**
   * Create candidate object
   */
  private createCandidate(
    stats: PropertyUsageStats,
  ): MaterializedColumnCandidate {
    const columnName = stats.propertyKey;

    let reason = `Used in ${stats.usageCount} reports (~${stats.queryFrequency} queries/day). `;

    if (stats.cardinality < 50) {
      reason += 'Low cardinality (ideal). ';
    } else if (stats.cardinality < 200) {
      reason += 'Moderate cardinality. ';
    }

    if (stats.estimatedSize < 100_000_000) {
      reason += 'Small storage cost. ';
    }

    reason += `Benefit: ${stats.benefit.toFixed(0)}.`;

    return {
      propertyKey: stats.propertyKey,
      columnName,
      reason,
      stats,
    };
  }

  /**
   * Execute materialization
   */
  private async materializeColumn(
    candidate: MaterializedColumnCandidate,
  ): Promise<void> {
    this.logger.info(`Materializing column: ${candidate.columnName}`, {
      reason: candidate.reason,
    });

    try {
      // Execute ALTER TABLE
      await chMigrationClient.command({
        query: `
          ALTER TABLE events
          ADD COLUMN IF NOT EXISTS ${candidate.columnName} String
          MATERIALIZED properties['${candidate.propertyKey}']
        `,
      });

      // Record in database
      await db.materializedColumn.create({
        data: {
          propertyKey: candidate.propertyKey,
          columnName: candidate.columnName,
          cardinality: candidate.stats.cardinality,
          usageCount: candidate.stats.usageCount,
          benefitScore: candidate.stats.benefit,
          estimatedSize: BigInt(candidate.stats.estimatedSize),
          status: 'active',
          materializedAt: new Date(),
        },
      });

      this.logger.info(`Successfully materialized: ${candidate.columnName}`);
    } catch (error) {
      // Try to record failure
      try {
        await db.materializedColumn.create({
          data: {
            propertyKey: candidate.propertyKey,
            columnName: candidate.columnName,
            cardinality: candidate.stats.cardinality,
            usageCount: candidate.stats.usageCount,
            benefitScore: candidate.stats.benefit,
            estimatedSize: BigInt(candidate.stats.estimatedSize),
            status: 'failed',
          },
        });
      } catch (dbError) {
        this.logger.error('Failed to record failure in database', { dbError });
      }

      throw error;
    }
  }

  /**
   * Generate human-readable report with ALL properties
   */
  private generateReport(
    candidates: MaterializedColumnCandidate[],
    allProperties: PropertyAnalysis[],
    dryRun: boolean,
  ): string {
    let report = '\n' + '='.repeat(80) + '\n';
    report += dryRun
      ? 'DRY RUN: Materialized Column Analysis\n'
      : 'Materialized Column Analysis\n';
    report += '='.repeat(80) + '\n\n';

    report += `Total properties analyzed: ${allProperties.length}\n`;
    report += `Candidates for materialization: ${candidates.length}\n\n`;

    // Section 1: Candidates (will be materialized)
    if (candidates.length > 0) {
      report += '━'.repeat(80) + '\n';
      report += '✅ RECOMMENDED FOR MATERIALIZATION\n';
      report += '━'.repeat(80) + '\n\n';

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]!;
        report += `${i + 1}. properties.${candidate.propertyKey}\n`;
        report += `   Usage: ${candidate.stats.usageCount} reports, ~${candidate.stats.queryFrequency} queries/day\n`;
        report += `   Cardinality: ${candidate.stats.cardinality} unique values\n`;
        report += `   Storage: ~${(candidate.stats.estimatedSize / 1_000_000).toFixed(2)} MB\n`;
        report += `   Benefit Score: ${candidate.stats.benefit.toFixed(2)}\n`;
        report += `   Reason: ${candidate.reason}\n\n`;
      }
    }

    // Section 2: All other properties with skip reasons
    const skipped = allProperties.filter((p) => p.skipReason);
    if (skipped.length > 0) {
      report += '━'.repeat(80) + '\n';
      report += 'ALL PROPERTIES ANALYZED\n';
      report += '━'.repeat(80) + '\n\n';

      for (const prop of skipped) {
        report += `• properties.${prop.propertyKey}\n`;
        report += `  ${prop.skipReason}\n`;
        report += `  Usage: ${prop.usageCount} reports, ~${prop.queryFrequency} queries/day`;
        if (prop.cardinality > 0) {
          report += `, Cardinality: ${prop.cardinality}, Benefit: ${prop.benefit.toFixed(0)}`;
        }
        report += '\n\n';
      }
    }

    // Summary
    report += '━'.repeat(80) + '\n';
    report += 'SUMMARY\n';
    report += '━'.repeat(80) + '\n';

    if (dryRun) {
      report += '⚠️  DRY RUN MODE: No changes will be made.\n';
      report += 'Run with --execute flag to materialize these columns.\n';
    } else if (candidates.length > 0) {
      report += `✅ Materializing top ${Math.min(candidates.length, this.MAX_DAILY_MATERIALIZATIONS)} columns...\n`;
    } else {
      report += 'No actions needed. All eligible properties are already materialized.\n';
    }

    report += '\n' + '='.repeat(80) + '\n';

    return report;
  }
}

export const materializeColumnsService = new MaterializeColumnsService();
