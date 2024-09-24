// import { type Mock, beforeEach, describe, expect, it, mock } from 'bun:test';
// import { getTime, toISOString } from '@openpanel/common';
// import type { Job } from 'bullmq';
// import { SESSION_TIMEOUT, incomingEvent } from './events.incoming-event';

// const projectId = 'test-project';
// const currentDeviceId = 'device-123';
// const previousDeviceId = 'device-456';
// const geo = {
//   country: 'US',
//   city: 'New York',
//   region: 'NY',
//   longitude: 0,
//   latitude: 0,
// };

// const createEvent = mock(() => {});
// const getLastScreenViewFromProfileId = mock();
// // // Mock dependencies
// mock.module('@openpanel/db', () => ({
//   createEvent,
//   getLastScreenViewFromProfileId,
// }));

// const sessionsQueue = { add: mock(() => Promise.resolve({})) };

// const findJobByPrefix = mock();

// mock.module('@openpanel/queue', () => ({
//   sessionsQueue,
//   findJobByPrefix,
// }));

// const getRedisQueue = mock(() => ({
//   keys: mock(() => Promise.resolve([])),
// }));

// mock.module('@openpanel/redis', () => ({
//   getRedisQueue,
// }));

// describe('incomingEvent', () => {
//   beforeEach(() => {
//     createEvent.mockClear();
//     findJobByPrefix.mockClear();
//     sessionsQueue.add.mockClear();
//     getLastScreenViewFromProfileId.mockClear();
//   });

//   it('should create a session start and an event', async () => {
//     const timestamp = new Date();
//     // Mock job data
//     const jobData = {
//       payload: {
//         geo,
//         event: {
//           name: 'test_event',
//           timestamp: timestamp.toISOString(),
//           properties: { __path: 'https://example.com/test' },
//         },
//         headers: {
//           'user-agent':
//             'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//           'openpanel-sdk-name': 'web',
//           'openpanel-sdk-version': '1.0.0',
//         },
//         projectId,
//         currentDeviceId,
//         previousDeviceId,
//         priority: true,
//       },
//     };

//     const job = { data: jobData } as Job;

//     // Execute the job
//     await incomingEvent(job);

//     const event = {
//       name: 'test_event',
//       deviceId: currentDeviceId,
//       // @ts-expect-error
//       sessionId: createEvent.mock.calls[1][0].sessionId,
//       profileId: '',
//       projectId,
//       properties: {
//         __hash: undefined,
//         __query: undefined,
//       },
//       createdAt: timestamp,
//       country: 'US',
//       city: 'New York',
//       region: 'NY',
//       longitude: 0,
//       latitude: 0,
//       os: 'Windows',
//       osVersion: '10',
//       browser: 'Chrome',
//       browserVersion: '91.0.4472.124',
//       device: 'desktop',
//       brand: '',
//       model: '',
//       duration: 0,
//       path: '/test',
//       origin: 'https://example.com',
//       referrer: '',
//       referrerName: '',
//       referrerType: 'unknown',
//       sdkName: 'web',
//       sdkVersion: '1.0.0',
//     };

//     expect(sessionsQueue.add.mock.calls[0]).toMatchObject([
//       'session',
//       {
//         type: 'createSessionEnd',
//         payload: event,
//       },
//       {
//         delay: SESSION_TIMEOUT,
//         jobId: `sessionEnd:${projectId}:${event.deviceId}:${timestamp.getTime()}`,
//       },
//     ]);

//     // Assertions
//     // Issue: https://github.com/oven-sh/bun/issues/10380
//     // expect(createEvent).toHaveBeenCalledWith(...)
//     expect(createEvent.mock.calls[0]).toMatchObject([
//       {
//         name: 'session_start',
//         deviceId: currentDeviceId,
//         sessionId: expect.stringMatching(
//           /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
//         ),
//         profileId: '',
//         projectId,
//         properties: {
//           __hash: undefined,
//           __query: undefined,
//         },
//         createdAt: new Date(timestamp.getTime() - 100),
//         country: 'US',
//         city: 'New York',
//         region: 'NY',
//         longitude: 0,
//         latitude: 0,
//         os: 'Windows',
//         osVersion: '10',
//         browser: 'Chrome',
//         browserVersion: '91.0.4472.124',
//         device: 'desktop',
//         brand: '',
//         model: '',
//         duration: 0,
//         path: '/test',
//         origin: 'https://example.com',
//         referrer: '',
//         referrerName: '',
//         referrerType: 'unknown',
//         sdkName: 'web',
//         sdkVersion: '1.0.0',
//       },
//     ]);
//     expect(createEvent.mock.calls[1]).toMatchObject([event]);

//     // Add more specific assertions based on the expected behavior
//   });

//   it('should reuse existing session', async () => {
//     // Mock job data
//     const jobData = {
//       payload: {
//         geo,
//         event: {
//           name: 'test_event',
//           timestamp: new Date().toISOString(),
//           properties: { __path: 'https://example.com/test' },
//         },
//         headers: {
//           'user-agent':
//             'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//           'openpanel-sdk-name': 'web',
//           'openpanel-sdk-version': '1.0.0',
//         },
//         projectId,
//         currentDeviceId,
//         previousDeviceId,
//         priority: false,
//       },
//     };
//     const changeDelay = mock();
//     findJobByPrefix.mockReturnValueOnce({
//       changeDelay,
//       data: {
//         type: 'createSessionEnd',
//         payload: {
//           sessionId: 'session-123',
//           deviceId: currentDeviceId,
//           profileId: currentDeviceId,
//           projectId,
//         },
//       },
//     });

//     const job = { data: jobData } as Job;

//     // Execute the job
//     await incomingEvent(job);

//     expect(changeDelay.mock.calls[0]).toMatchObject([SESSION_TIMEOUT]);

//     // Assertions
//     // Issue: https://github.com/oven-sh/bun/issues/10380
//     // expect(createEvent).toHaveBeenCalledWith(...)
//     expect(createEvent.mock.calls[0]).toMatchObject([
//       {
//         name: 'test_event',
//         deviceId: currentDeviceId,
//         profileId: '',
//         sessionId: 'session-123',
//         projectId,
//         properties: {
//           __hash: undefined,
//           __query: undefined,
//         },
//         createdAt: expect.any(Date),
//         country: 'US',
//         city: 'New York',
//         region: 'NY',
//         longitude: 0,
//         latitude: 0,
//         os: 'Windows',
//         osVersion: '10',
//         browser: 'Chrome',
//         browserVersion: '91.0.4472.124',
//         device: 'desktop',
//         brand: '',
//         model: '',
//         duration: 0,
//         path: '/test',
//         origin: 'https://example.com',
//         referrer: '',
//         referrerName: '',
//         referrerType: 'unknown',
//         sdkName: 'web',
//         sdkVersion: '1.0.0',
//       },
//     ]);

//     // Add more specific assertions based on the expected behavior
//   });

//   it('should handle server events', async () => {
//     const timestamp = new Date();
//     const jobData = {
//       payload: {
//         geo,
//         event: {
//           name: 'server_event',
//           timestamp: timestamp.toISOString(),
//           properties: { custom_property: 'test_value' },
//           profileId: 'profile-123',
//         },
//         headers: {
//           'user-agent': 'OpenPanel Server/1.0',
//           'openpanel-sdk-name': 'server',
//           'openpanel-sdk-version': '1.0.0',
//         },
//         projectId,
//         currentDeviceId: '',
//         previousDeviceId: '',
//         priority: true,
//       },
//     };

//     const job = { data: jobData } as Job;

//     const mockLastScreenView = {
//       deviceId: 'last-device-123',
//       sessionId: 'last-session-456',
//       country: 'CA',
//       city: 'Toronto',
//       region: 'ON',
//       os: 'iOS',
//       osVersion: '15.0',
//       browser: 'Safari',
//       browserVersion: '15.0',
//       device: 'mobile',
//       brand: 'Apple',
//       model: 'iPhone',
//       path: '/last-path',
//       origin: 'https://example.com',
//       referrer: 'https://google.com',
//       referrerName: 'Google',
//       referrerType: 'search',
//     };

//     getLastScreenViewFromProfileId.mockReturnValueOnce(mockLastScreenView);

//     await incomingEvent(job);

//     // expect(getLastScreenViewFromProfileId).toHaveBeenCalledWith({
//     //   profileId: 'profile-123',
//     //   projectId,
//     // });

//     expect(createEvent.mock.calls[0]).toMatchObject([
//       {
//         name: 'server_event',
//         deviceId: 'last-device-123',
//         sessionId: 'last-session-456',
//         profileId: 'profile-123',
//         projectId,
//         properties: {
//           custom_property: 'test_value',
//           user_agent: 'OpenPanel Server/1.0',
//         },
//         createdAt: timestamp,
//         country: 'CA',
//         city: 'Toronto',
//         region: 'ON',
//         longitude: 0,
//         latitude: 0,
//         os: 'iOS',
//         osVersion: '15.0',
//         browser: 'Safari',
//         browserVersion: '15.0',
//         device: 'mobile',
//         brand: 'Apple',
//         model: 'iPhone',
//         duration: 0,
//         path: '/last-path',
//         origin: 'https://example.com',
//         referrer: 'https://google.com',
//         referrerName: 'Google',
//         referrerType: 'search',
//         sdkName: 'server',
//         sdkVersion: '1.0.0',
//       },
//     ]);

//     expect(sessionsQueue.add).not.toHaveBeenCalled();
//     expect(findJobByPrefix).not.toHaveBeenCalled();
//   });

//   // Add more test cases for different scenarios:
//   // - Server events
//   // - Existing sessions
//   // - Different priorities
//   // - Error cases
// });
