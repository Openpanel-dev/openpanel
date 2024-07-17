import { ch, chQuery } from '@openpanel/db';

async function main() {
  const projects = await chQuery(
    `SELECT distinct project_id FROM events ORDER BY project_id`
  );
  const withOrigin = [];

  for (const project of projects) {
    try {
      const [eventWithOrigin, eventWithoutOrigin] = await Promise.all([
        await chQuery(
          `SELECT * FROM events WHERE origin != '' AND project_id = '${project.project_id}' ORDER BY created_at DESC LIMIT 1`
        ),
        await chQuery(
          `SELECT * FROM events WHERE origin = '' AND project_id = '${project.project_id}' AND path != '' ORDER BY created_at DESC LIMIT 1`
        ),
      ]);

      if (eventWithOrigin[0] && eventWithoutOrigin[0]) {
        console.log(`Project ${project.project_id} as events without origin`);
        console.log(`- Origin: ${eventWithOrigin[0].origin}`);
        withOrigin.push(project.project_id);
        const events = await chQuery(
          `SELECT count(*) as count FROM events WHERE project_id = '${project.project_id}' AND path != '' AND origin = ''`
        );
        console.log(`🤠🤠🤠🤠 Will update ${events[0]?.count} events`);
        await ch.command({
          query: `ALTER TABLE events UPDATE origin = '${eventWithOrigin[0].origin}' WHERE project_id = '${project.project_id}' AND path != '' AND origin = '';`,
          clickhouse_settings: {
            wait_end_of_query: 1,
          },
        });
      }

      if (!eventWithOrigin[0] && eventWithoutOrigin[0]) {
        console.log(
          `😧 Project ${project.project_id} has no events with origin (last event ${eventWithoutOrigin[0].created_at})`
        );
        console.log('- NO ORIGIN');
      }

      if (!eventWithOrigin[0] && !eventWithoutOrigin[0]) {
        console.log(
          `🔥 WARNING: Project ${project.project_id} has no events at all?!?!?!`
        );
      }

      if (eventWithOrigin[0] && !eventWithoutOrigin[0]) {
        console.log(
          `✅ Project ${project.project_id} has all events with origin!!!`
        );
      }
      console.log('');
      console.log('');

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      console.log('🥵 ERROR ORRROR');
      console.log('Error for project', project.project_id);
    }
  }
  process.exit(0);
}
main();
