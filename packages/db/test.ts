import { conversionService } from './src/services/conversion.service';
// 68/37
async function main() {
  const conversion = await conversionService.getConversion({
    projectId: 'kiddokitchen-app',
    startDate: '2025-02-01',
    endDate: '2025-03-01',
    funnelGroup: 'session_id',
    breakdowns: [
      {
        name: 'os',
      },
    ],
    interval: 'day',
    events: [
      {
        segment: 'event',
        name: 'screen_view',
        filters: [
          {
            name: 'path',
            operator: 'is',
            value: ['Start'],
          },
        ],
      },
      {
        segment: 'event',
        name: 'sign_up',
        filters: [],
      },
    ],
  });

  console.dir(conversion, { depth: null });
}

main();
