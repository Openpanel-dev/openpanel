import { type ILogger, createLogger } from '@openpanel/logger';
import { ch } from '../clickhouse/client';
import { chMigrationClient } from '../clickhouse/migration';
import { db } from '../../index';
import { refreshMaterializedColumnsCache } from './chart.service';

interface PropertyUsageStats {
  property: string; // Full path: "properties.utm_source" or "profile.properties.campaign"
  propertyKey: string; // Key only: "utm_source" or "campaign"
  targetTable: 'events' | 'profiles'; // Which ClickHouse table to materialize on
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
  targetTable: 'events' | 'profiles';
  reason: string;
  stats: PropertyUsageStats;
}

export class MaterializeColumnsService {
  private logger: ILogger;

  // Thresholds for materialization decisions
  private readonly MIN_USAGE_COUNT = 1; // Must be used in at least 1 report
  private readonly MAX_CARDINALITY = 1000; // Don't materialize if >1000 unique values
  private readonly MIN_BENEFIT_SCORE = 20; // Minimum benefit score to justify materialization
  private readonly MAX_DAILY_MATERIALIZATIONS = 3; // Rate limit: max 3 new columns per day (total across both tables)

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

    // Run both pipelines: events first, then profiles
    const { candidates: eventsCandidates, allProperties: eventsProperties } =
      await this.analyzeDashboardProperties('events', threshold);

    const { candidates: profilesCandidates, allProperties: profilesProperties } =
      await this.analyzeDashboardProperties('profiles', threshold);

    const candidates = [...eventsCandidates, ...profilesCandidates];
    const allProperties = [...eventsProperties, ...profilesProperties];

    // Generate combined report
    const report = this.generateReport(candidates, allProperties, dryRun);

    // Execute if not dry-run
    const materialized: string[] = [];
    if (!dryRun && candidates.length > 0) {
      // Rate limiting across both tables combined
      const limited = candidates.slice(0, this.MAX_DAILY_MATERIALIZATIONS);
      if (limited.length < candidates.length) {
        this.logger.warn(
          `Rate limiting: Only materializing ${limited.length} of ${candidates.length} candidates`,
        );
      }

      for (const candidate of limited) {
        try {
          await this.materializeColumn(candidate);
          materialized.push(`${candidate.targetTable}:${candidate.propertyKey}`);
        } catch (error) {
          this.logger.error(
            `Failed to materialize ${candidate.targetTable}:${candidate.propertyKey}`,
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
   * Main analysis function for a specific target table
   */
  private async analyzeDashboardProperties(
    targetTable: 'events' | 'profiles',
    threshold: number,
  ): Promise<{
    candidates: MaterializedColumnCandidate[];
    allProperties: PropertyAnalysis[];
  }> {
    const propertyUsage = targetTable === 'events'
      ? await this.getEventsPropertyUsageFromReports()
      : await this.getProfilePropertyUsageFromReports();

    if (propertyUsage.length === 0) {
      this.logger.info(`No ${targetTable} properties found in reports`);
      return { candidates: [], allProperties: [] };
    }

    this.logger.info(`Found ${propertyUsage.length} unique ${targetTable} properties in reports`);

    // Check already tracked in database
    const existingColumns = await db.materializedColumn.findMany({
      where: { status: 'active', targetTable },
      select: { propertyKey: true },
    });
    const existingKeys = new Set(existingColumns.map((c) => c.propertyKey));

    // Check columns already existing in ClickHouse
    const clickhouseColumns = await this.getExistingClickHouseColumns(targetTable);
    const clickhouseColumnNames = new Set(clickhouseColumns);

    const alreadyTracked = propertyUsage.filter((p) => existingKeys.has(p.propertyKey));
    const alreadyExistsInClickHouse = propertyUsage.filter(
      (p) => !existingKeys.has(p.propertyKey) && clickhouseColumnNames.has(p.propertyKey),
    );
    const newProperties = propertyUsage.filter(
      (p) => !existingKeys.has(p.propertyKey) && !clickhouseColumnNames.has(p.propertyKey),
    );

    const allProperties: PropertyAnalysis[] = [];

    allProperties.push(
      ...alreadyTracked.map((p) => ({
        ...p,
        cardinality: 0,
        estimatedSize: 0,
        benefit: 0,
        skipReason: '✅ Already materialized (tracked)',
      })),
    );

    allProperties.push(
      ...alreadyExistsInClickHouse.map((p) => ({
        ...p,
        cardinality: 0,
        estimatedSize: 0,
        benefit: 0,
        skipReason: `✅ Column already exists in ${targetTable} table`,
      })),
    );

    if (newProperties.length === 0) {
      this.logger.info(`No new ${targetTable} properties to analyze (all already materialized)`);
      return { candidates: [], allProperties };
    }

    this.logger.info(`${newProperties.length} ${targetTable} properties not yet materialized`);

    // Enrich with ClickHouse statistics
    const enrichedStats = await Promise.all(
      newProperties.map((usage) => this.enrichWithClickHouseStats(usage)),
    );

    // Calculate benefit scores
    const statsWithBenefit = enrichedStats.map((stats) => this.calculateBenefitScore(stats));

    // Determine skip reasons
    const analyzed = statsWithBenefit.map((stats) => ({
      ...stats,
      skipReason: this.getSkipReason(stats, threshold),
    }));

    allProperties.push(...analyzed);

    const candidates = analyzed
      .filter((stat) => !stat.skipReason)
      .map((stats) => this.createCandidate(stats))
      .sort((a, b) => b.stats.benefit - a.stats.benefit);

    this.logger.info(`Identified ${candidates.length} ${targetTable} candidates for materialization`);

    return {
      candidates,
      allProperties: allProperties.sort((a, b) => b.benefit - a.benefit),
    };
  }

  /**
   * Get existing materialized column names from a ClickHouse table
   */
  private async getExistingClickHouseColumns(targetTable: 'events' | 'profiles'): Promise<string[]> {
    try {
      const result = await ch.query({
        query: `
          SELECT name
          FROM system.columns
          WHERE database = 'default'
            AND table = '${targetTable}'
            AND default_kind = 'MATERIALIZED'
        `,
        format: 'JSONEachRow',
      });

      const data = await result.json<{ name: string }>();
      return data.map((row) => row.name);
    } catch (error) {
      this.logger.warn(`Failed to get existing ClickHouse columns for ${targetTable}`, { error });
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
      return `❌ No data found in source table`;
    }

    if (stats.cardinality > this.MAX_CARDINALITY) {
      return `❌ Too high cardinality (${stats.cardinality} values > ${this.MAX_CARDINALITY} limit)`;
    }

    if (stats.benefit < threshold) {
      return `❌ Benefit too low (${stats.benefit.toFixed(0)} < ${threshold} threshold)`;
    }

    return undefined;
  }

  /**
   * Extract event properties from reports (properties.*)
   */
  private async getEventsPropertyUsageFromReports(): Promise<
    Array<{
      property: string;
      propertyKey: string;
      targetTable: 'events';
      usageCount: number;
      queryFrequency: number;
    }>
  > {
    const reports = await db.report.findMany({
      select: { breakdowns: true, events: true },
    });

    const propertyMap = new Map<string, number>();

    for (const report of reports) {
      const { eventsProperties } = this.extractPropertiesFromReport(report);
      for (const prop of eventsProperties) {
        propertyMap.set(prop, (propertyMap.get(prop) || 0) + 1);
      }
    }

    const ESTIMATED_QUERIES_PER_DAY = 10;

    return Array.from(propertyMap.entries()).map(([property, usageCount]) => ({
      property,
      propertyKey: property.replace('properties.', ''),
      targetTable: 'events' as const,
      usageCount,
      queryFrequency: usageCount * ESTIMATED_QUERIES_PER_DAY,
    }));
  }

  /**
   * Extract profile properties from reports (profile.properties.*)
   */
  private async getProfilePropertyUsageFromReports(): Promise<
    Array<{
      property: string;
      propertyKey: string;
      targetTable: 'profiles';
      usageCount: number;
      queryFrequency: number;
    }>
  > {
    const reports = await db.report.findMany({
      select: { breakdowns: true, events: true },
    });

    const propertyMap = new Map<string, number>();

    for (const report of reports) {
      const { profileProperties } = this.extractPropertiesFromReport(report);
      for (const prop of profileProperties) {
        propertyMap.set(prop, (propertyMap.get(prop) || 0) + 1);
      }
    }

    const ESTIMATED_QUERIES_PER_DAY = 10;

    return Array.from(propertyMap.entries()).map(([property, usageCount]) => ({
      property,
      // "profile.properties.campaign" -> "campaign"
      propertyKey: property.replace('profile.properties.', ''),
      targetTable: 'profiles' as const,
      usageCount,
      queryFrequency: usageCount * ESTIMATED_QUERIES_PER_DAY,
    }));
  }

  /**
   * Extract property names from report JSON fields
   * Returns two sets: event properties and profile properties
   */
  private extractPropertiesFromReport(report: {
    breakdowns: any;
    events: any;
  }): { eventsProperties: string[]; profileProperties: string[] } {
    const eventsProperties = new Set<string>();
    const profileProperties = new Set<string>();

    const isValid = (name: string) =>
      !name.includes('*') && !name.includes('(') && !name.includes('[');

    // Parse breakdowns
    try {
      const breakdowns = Array.isArray(report.breakdowns) ? report.breakdowns : [];
      for (const breakdown of breakdowns) {
        if (breakdown?.name && typeof breakdown.name === 'string') {
          if (breakdown.name.startsWith('properties.') && isValid(breakdown.name)) {
            eventsProperties.add(breakdown.name);
          } else if (breakdown.name.startsWith('profile.properties.') && isValid(breakdown.name)) {
            profileProperties.add(breakdown.name);
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
            if (filter?.name && typeof filter.name === 'string') {
              if (filter.name.startsWith('properties.') && isValid(filter.name)) {
                eventsProperties.add(filter.name);
              } else if (filter.name.startsWith('profile.properties.') && isValid(filter.name)) {
                profileProperties.add(filter.name);
              }
            }
          }
        }
      }
    } catch (e) {
      this.logger.warn('Failed to parse event filters', { error: e });
    }

    return {
      eventsProperties: Array.from(eventsProperties),
      profileProperties: Array.from(profileProperties),
    };
  }

  /**
   * Get cardinality and size stats from ClickHouse
   * For events: uses event_property_values_mv
   * For profiles: queries the profiles table directly
   */
  private async enrichWithClickHouseStats(usage: {
    property: string;
    propertyKey: string;
    targetTable: 'events' | 'profiles';
    usageCount: number;
    queryFrequency: number;
  }): Promise<PropertyUsageStats> {
    try {
      let query: string;

      if (usage.targetTable === 'profiles') {
        // Query the profiles table directly for profile properties
        query = `
          SELECT
            uniqExact(properties['${usage.propertyKey}']) AS cardinality,
            avg(length(properties['${usage.propertyKey}'])) AS avg_length,
            count() AS total_occurrences
          FROM profiles
          WHERE properties['${usage.propertyKey}'] != ''
        `;
      } else {
        // Use the materialized view for event properties (much faster)
        query = `
          SELECT
            uniqExact(property_value) AS cardinality,
            avg(length(property_value)) AS avg_length,
            count() AS total_occurrences
          FROM event_property_values_mv
          WHERE property_key = '${usage.propertyKey}'
            AND property_value != ''
        `;
      }

      const result = await ch.query({ query, format: 'JSONEachRow' });

      const data = await result.json<{
        cardinality: string;
        avg_length: string;
        total_occurrences: string;
      }>();

      const cardinality = Number(data[0]?.cardinality || 0);
      const avgLength = Number(data[0]?.avg_length || 10);
      const totalOccurrences = Number(data[0]?.total_occurrences || 0);
      const estimatedSize = Math.ceil(avgLength * totalOccurrences);

      return {
        property: usage.property,
        propertyKey: usage.propertyKey,
        targetTable: usage.targetTable,
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
        targetTable: usage.targetTable,
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
  private calculateBenefitScore(stats: PropertyUsageStats): PropertyUsageStats {
    const usageScore = stats.usageCount * 10;
    const frequencyScore = Math.min(stats.queryFrequency, 1000);
    const cardinalityPenalty = Math.max(0, stats.cardinality - 100) * 0.5;
    const sizePenalty = stats.estimatedSize / 1_000_000;

    const benefit = usageScore + frequencyScore - cardinalityPenalty - sizePenalty;

    return { ...stats, benefit: Math.max(0, benefit) };
  }

  /**
   * Create candidate object
   */
  private createCandidate(stats: PropertyUsageStats): MaterializedColumnCandidate {
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
      targetTable: stats.targetTable,
      reason,
      stats,
    };
  }

  /**
   * Execute materialization on the appropriate table
   */
  private async materializeColumn(candidate: MaterializedColumnCandidate): Promise<void> {
    const table = candidate.targetTable;

    this.logger.info(`Materializing column: ${table}.${candidate.columnName}`, {
      reason: candidate.reason,
    });

    try {
      // Execute ALTER TABLE on the target table
      await chMigrationClient.command({
        query: `
          ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS ${candidate.columnName} String
          MATERIALIZED properties['${candidate.propertyKey}']
        `,
      });

      // Record in database with targetTable
      await db.materializedColumn.create({
        data: {
          targetTable: candidate.targetTable,
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

      // Refresh chart service cache so new column is used immediately
      await refreshMaterializedColumnsCache();

      this.logger.info(`Successfully materialized: ${table}.${candidate.columnName}`);
    } catch (error) {
      try {
        await db.materializedColumn.create({
          data: {
            targetTable: candidate.targetTable,
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
   * Generate human-readable report
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

    if (candidates.length > 0) {
      report += '━'.repeat(80) + '\n';
      report += '✅ RECOMMENDED FOR MATERIALIZATION\n';
      report += '━'.repeat(80) + '\n\n';

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]!;
        const prefix = candidate.targetTable === 'profiles' ? 'profile.properties' : 'properties';
        report += `${i + 1}. ${prefix}.${candidate.propertyKey} [${candidate.targetTable}]\n`;
        report += `   Usage: ${candidate.stats.usageCount} reports, ~${candidate.stats.queryFrequency} queries/day\n`;
        report += `   Cardinality: ${candidate.stats.cardinality} unique values\n`;
        report += `   Storage: ~${(candidate.stats.estimatedSize / 1_000_000).toFixed(2)} MB\n`;
        report += `   Benefit Score: ${candidate.stats.benefit.toFixed(2)}\n`;
        report += `   Reason: ${candidate.reason}\n\n`;
      }
    }

    const skipped = allProperties.filter((p) => p.skipReason);
    if (skipped.length > 0) {
      report += '━'.repeat(80) + '\n';
      report += 'ALL PROPERTIES ANALYZED\n';
      report += '━'.repeat(80) + '\n\n';

      for (const prop of skipped) {
        const prefix = prop.targetTable === 'profiles' ? 'profile.properties' : 'properties';
        report += `• ${prefix}.${prop.propertyKey} [${prop.targetTable}]\n`;
        report += `  ${prop.skipReason}\n`;
        report += `  Usage: ${prop.usageCount} reports, ~${prop.queryFrequency} queries/day`;
        if (prop.cardinality > 0) {
          report += `, Cardinality: ${prop.cardinality}, Benefit: ${prop.benefit.toFixed(0)}`;
        }
        report += '\n\n';
      }
    }

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
