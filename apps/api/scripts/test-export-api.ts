/**
 * Script to test the Export API endpoints
 * 
 * Specifically tests that the /export/events endpoint includes event properties in the payload
 * 
 * Usage:
 *   pnpm jiti scripts/test-export-api.ts
 *
 * Environment variables:
 *   CLIENT_ID: Export API client ID (with read or root permissions)
 *   CLIENT_SECRET: Export API client secret
 *   PROJECT_ID: Project ID to test against
 *   API_URL: API base URL (default: http://localhost:3333)
 */

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const PROJECT_ID = process.env.PROJECT_ID!;
const API_BASE_URL = process.env.API_URL || 'http://localhost:3333';

if (!CLIENT_ID || !CLIENT_SECRET || !PROJECT_ID) {
  console.error('CLIENT_ID, CLIENT_SECRET, and PROJECT_ID must be set');
  process.exit(1);
}

interface TestResult {
  name: string;
  method: string;
  url: string;
  status: number;
  success: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

async function makeRequest(
  method: string,
  path: string,
  params?: Record<string, any>,
): Promise<TestResult> {
  let url = `${API_BASE_URL}${path}`;
  
  if (params && method === 'GET') {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        searchParams.append(key, JSON.stringify(value));
      } else if (value instanceof Object) {
        searchParams.append(key, JSON.stringify(value));
      } else if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    url += '?' + searchParams.toString();
  }

  const headers: Record<string, string> = {
    'openpanel-client-id': CLIENT_ID,
    'openpanel-client-secret': CLIENT_SECRET,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json().catch(() => ({}));

    return {
      name: `${method} ${path}`,
      method,
      url,
      status: response.status,
      success: response.ok,
      error: response.ok ? undefined : data.message || 'Request failed',
      data: response.ok ? data : undefined,
    };
  } catch (error) {
    return {
      name: `${method} ${path}`,
      method,
      url,
      status: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function testExportEvents() {
  console.log('\n📊 Testing Export Events endpoint...\n');

  // Test 1: Basic events export without includes
  console.log('Test 1: Basic events export (should include properties by default)');
  const basicResult = await makeRequest('GET', '/export/events', {
    projectId: PROJECT_ID,
    limit: 10,
  });
  results.push(basicResult);
  
  if (basicResult.success) {
    console.log(`✅ GET /export/events: ${basicResult.status}`);
    
    if (basicResult.data?.data?.length > 0) {
      const firstEvent = basicResult.data.data[0];
      console.log(`  Total events returned: ${basicResult.data.data.length}`);
      
      // Check for properties field
      if (firstEvent.properties !== undefined) {
        console.log(`  ✅ Properties field present: ${JSON.stringify(firstEvent.properties)}`);
      } else {
        console.log(`  ❌ Properties field MISSING in event`);
        console.log(`  Event keys: ${Object.keys(firstEvent).join(', ')}`);
        throw new Error('Test 1 FAILED: Properties field is missing from export/events response');
      }
      
      // Log redacted event structure (keys only, no sensitive data)
      console.log(`  Event keys: ${Object.keys(firstEvent).join(', ')}`);
      console.log(`  Properties keys: ${Object.keys(firstEvent.properties || {}).join(', ')}`);
    } else {
      console.log(`  ⚠️  No events returned for this project`);
    }
  } else {
    console.log(`❌ GET /export/events: ${basicResult.status}`);
    if (basicResult.error) console.log(`  Error: ${basicResult.error}`);
  }

  // Test 2: Events export with specific event filter
  console.log('\n\nTest 2: Events export with event filter');
  const filteredResult = await makeRequest('GET', '/export/events', {
    projectId: PROJECT_ID,
    event: 'screen_view',
    limit: 5,
  });
  results.push(filteredResult);
  
  if (filteredResult.success) {
    console.log(`✅ GET /export/events (filtered): ${filteredResult.status}`);
    
    if (filteredResult.data?.data?.length > 0) {
      const firstEvent = filteredResult.data.data[0];
      console.log(`  Events returned: ${filteredResult.data.data.length}`);
      
      if (firstEvent.properties !== undefined) {
        console.log(`  ✅ Properties field present`);
      } else {
        console.log(`  ❌ Properties field MISSING`);
        throw new Error('Test 2 FAILED: Properties field is missing from filtered export/events response');
      }
    } else {
      console.log(`  ⚠️  No matching events found`);
    }
  } else {
    console.log(`❌ GET /export/events (filtered): ${filteredResult.status}`);
  }

  // Test 3: Events export with profile include
  console.log('\n\nTest 3: Events export with profile include');
  const withProfileResult = await makeRequest('GET', '/export/events', {
    projectId: PROJECT_ID,
    includes: ['profile'],
    limit: 5,
  });
  results.push(withProfileResult);
  
  if (withProfileResult.success) {
    console.log(`✅ GET /export/events (with profile): ${withProfileResult.status}`);
    
    if (withProfileResult.data?.data?.length > 0) {
      const firstEvent = withProfileResult.data.data[0];
      
      if (firstEvent.properties !== undefined) {
        console.log(`  ✅ Properties field present`);
      } else {
        console.log(`  ❌ Properties field MISSING`);
        throw new Error('Test 3 FAILED: Properties field is missing from export/events response with profile include');
      }
      
      if (firstEvent.profile !== undefined) {
        console.log(`  ✅ Profile field present (included)`);
      } else {
        console.log(`  ⚠️  Profile field not included (expected due to permissions)`);
      }
    }
  } else {
    console.log(`❌ GET /export/events (with profile): ${withProfileResult.status}`);
  }

  // Test 4: Events export with date range
  console.log('\n\nTest 4: Events export with date range');
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const dateRangeResult = await makeRequest('GET', '/export/events', {
    projectId: PROJECT_ID,
    start: weekAgo.toISOString().split('T')[0],
    end: now.toISOString().split('T')[0],
    limit: 5,
  });
  results.push(dateRangeResult);
  
  if (dateRangeResult.success) {
    console.log(`✅ GET /export/events (date range): ${dateRangeResult.status}`);
    
    if (dateRangeResult.data?.data?.length > 0) {
      const firstEvent = dateRangeResult.data.data[0];
      
      if (firstEvent.properties !== undefined) {
        console.log(`  ✅ Properties field present`);
      } else {
        console.log(`  ❌ Properties field MISSING`);
        throw new Error('Test 4 FAILED: Properties field is missing from export/events response with date range');
      }
    }
  } else {
    console.log(`❌ GET /export/events (date range): ${dateRangeResult.status}`);
  }
}

async function main() {
  console.log(`🚀 Export API Test Suite`);
  console.log(`Using API_URL: ${API_BASE_URL}`);
  console.log(`Using PROJECT_ID: ${PROJECT_ID}`);

  await testExportEvents();

  // Summary
  console.log('\n\n📋 Test Summary');
  console.log('─'.repeat(50));
  
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter((r) => !r.success).forEach((r) => {
      console.log(`  - ${r.name}: ${r.error || r.status}`);
    });
    process.exit(1);
  }
  
  console.log('\n✨ All tests passed!');
}

main().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
