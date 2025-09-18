#!/usr/bin/env tsx

/**
 * Script to validate and optionally fix VersionedCollapsingMergeTree session issues
 *
 * Usage:
 *   npx tsx validate-sessions.ts --check                    # Check for issues
 *   npx tsx validate-sessions.ts --fix                      # Fix orphaned rows
 *   npx tsx validate-sessions.ts --session-id <id>          # Check specific session
 */

import { SessionBuffer } from '../src/buffers/session-buffer';
import { TABLE_NAMES, ch } from '../src/clickhouse/client';

interface SessionIssue {
  sessionId: string;
  projectId: string;
  issues: Array<{
    version: number;
    type: 'orphaned_negative' | 'missing_negative' | 'version_gap';
    description: string;
  }>;
}

async function findProblematicSessions(
  projectId?: string,
  limit = 100,
): Promise<SessionIssue[]> {
  const whereClause = projectId ? `WHERE project_id = '${projectId}'` : '';

  // Find sessions that have issues with FINAL vs non-FINAL queries
  const query = `
    WITH session_stats AS (
      SELECT 
        id,
        project_id,
        count() as total_rows,
        countIf(sign = 1) as positive_rows,
        countIf(sign = -1) as negative_rows,
        min(version) as min_version,
        max(version) as max_version,
        groupArray(version) as versions
      FROM ${TABLE_NAMES.sessions}
      ${whereClause}
      GROUP BY id, project_id
    ),
    final_stats AS (
      SELECT 
        id,
        project_id,
        count() as final_rows
      FROM ${TABLE_NAMES.sessions} FINAL
      ${whereClause}
      GROUP BY id, project_id
    )
    SELECT 
      s.id,
      s.project_id,
      s.total_rows,
      s.positive_rows,
      s.negative_rows,
      s.min_version,
      s.max_version,
      s.versions,
      f.final_rows
    FROM session_stats s
    LEFT JOIN final_stats f ON s.id = f.id AND s.project_id = f.project_id
    WHERE s.total_rows != (s.positive_rows + s.negative_rows)
       OR f.final_rows > 1
       OR (s.positive_rows > 1 AND s.negative_rows != s.positive_rows - 1)
    ORDER BY s.total_rows DESC
    LIMIT ${limit}
  `;

  const result = await ch.query(query);
  const issues: SessionIssue[] = [];

  for (const row of result.data) {
    const sessionId = row.id as string;
    const projectId = row.project_id as string;
    const totalRows = row.total_rows as number;
    const positiveRows = row.positive_rows as number;
    const negativeRows = row.negative_rows as number;
    const finalRows = row.final_rows as number;
    const versions = row.versions as number[];

    const sessionIssues: SessionIssue['issues'] = [];

    // Check for orphaned negative rows
    if (negativeRows > positiveRows - 1) {
      sessionIssues.push({
        version: -1, // We'll need to determine which specific versions
        type: 'orphaned_negative',
        description: `Has ${negativeRows} negative rows but only ${positiveRows} positive rows`,
      });
    }

    // Check for missing negative rows
    if (positiveRows > 1 && negativeRows !== positiveRows - 1) {
      sessionIssues.push({
        version: -1,
        type: 'missing_negative',
        description: `Has ${positiveRows} positive rows but only ${negativeRows} negative rows (should be ${positiveRows - 1})`,
      });
    }

    // Check for version gaps
    const sortedVersions = [...new Set(versions)].sort((a, b) => a - b);
    for (let i = 1; i < sortedVersions.length; i++) {
      if (sortedVersions[i] - sortedVersions[i - 1] > 1) {
        sessionIssues.push({
          version: sortedVersions[i],
          type: 'version_gap',
          description: `Version gap: ${sortedVersions[i - 1]} -> ${sortedVersions[i]}`,
        });
      }
    }

    if (sessionIssues.length > 0) {
      issues.push({
        sessionId,
        projectId,
        issues: sessionIssues,
      });
    }
  }

  return issues;
}

async function validateSpecificSession(sessionId: string) {
  const sessionBuffer = new SessionBuffer();
  return await sessionBuffer.validateSessionVersions(sessionId);
}

async function fixOrphanedSessions(issues: SessionIssue[], dryRun = true) {
  console.log(
    `${dryRun ? 'DRY RUN: ' : ''}Fixing ${issues.length} problematic sessions...`,
  );

  for (const issue of issues) {
    console.log(
      `\n${dryRun ? 'Would fix' : 'Fixing'} session ${issue.sessionId}:`,
    );

    // Get all rows for this session
    const sessionRows = await ch.query(
      `SELECT * FROM ${TABLE_NAMES.sessions} WHERE id = {sessionId:String} ORDER BY version, sign`,
      { sessionId: issue.sessionId },
    );

    console.log(`  - Found ${sessionRows.data.length} total rows`);

    // For now, we'll just log what we would do
    // In a real fix, you might want to:
    // 1. Delete all orphaned negative rows
    // 2. Recreate proper version sequences
    // 3. Or mark sessions for reprocessing

    for (const row of sessionRows.data) {
      const version = row.version as number;
      const sign = row.sign as number;
      console.log(`    Version ${version}, Sign ${sign}`);
    }

    if (!dryRun) {
      // Implement actual fixes here
      console.log('  - Fix implementation would go here');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case '--check': {
        const projectId = args.includes('--project-id')
          ? args[args.indexOf('--project-id') + 1]
          : undefined;

        console.log('Checking for problematic sessions...');
        const issues = await findProblematicSessions(projectId);

        if (issues.length === 0) {
          console.log('✅ No problematic sessions found!');
        } else {
          console.log(`❌ Found ${issues.length} problematic sessions:`);
          for (const issue of issues.slice(0, 10)) {
            // Show first 10
            console.log(`\nSession ${issue.sessionId} (${issue.projectId}):`);
            for (const sessionIssue of issue.issues) {
              console.log(`  - ${sessionIssue.description}`);
            }
          }

          if (issues.length > 10) {
            console.log(`\n... and ${issues.length - 10} more`);
          }
        }
        break;
      }

      case '--session-id': {
        const sessionId = args[1];
        if (!sessionId) {
          console.error('Please provide a session ID: --session-id <id>');
          process.exit(1);
        }

        console.log(`Validating session ${sessionId}...`);
        const validation = await validateSpecificSession(sessionId);

        console.log('Validation result:', JSON.stringify(validation, null, 2));
        break;
      }

      case '--fix': {
        const dryRun = !args.includes('--confirm');
        const projectId = args.includes('--project-id')
          ? args[args.indexOf('--project-id') + 1]
          : undefined;

        if (!dryRun) {
          console.log('⚠️  DANGER: This will modify your ClickHouse data!');
          console.log('Make sure you have backups before proceeding.');
        }

        const issues = await findProblematicSessions(projectId);
        await fixOrphanedSessions(issues, dryRun);
        break;
      }

      default:
        console.log(`
Session Validator Tool

Usage:
  npx tsx validate-sessions.ts --check [--project-id <id>]
  npx tsx validate-sessions.ts --session-id <session-id>
  npx tsx validate-sessions.ts --fix [--project-id <id>] [--confirm]

Commands:
  --check           Check for problematic sessions
  --session-id      Validate a specific session
  --fix             Fix problematic sessions (add --confirm to actually execute)

Options:
  --project-id      Limit to specific project
  --confirm         Actually execute fixes (otherwise dry run)
        `);
        break;
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
