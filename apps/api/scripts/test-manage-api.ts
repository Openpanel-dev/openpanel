/**
 * One-off script to test all /manage/ API endpoints
 *
 * Usage:
 *   pnpm test:manage
 *   or
 *   pnpm jiti scripts/test-manage-api.ts
 *
 * Set API_URL environment variable to test against a different server:
 *   API_URL=http://localhost:3000 pnpm test:manage
 */

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const API_BASE_URL = process.env.API_URL || 'http://localhost:3333';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('CLIENT_ID and CLIENT_SECRET must be set');
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
  body?: any,
): Promise<TestResult> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'openpanel-client-id': CLIENT_ID,
    'openpanel-client-secret': CLIENT_SECRET,
  };

  // Only set Content-Type if there's a body
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

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

async function testProjects() {
  console.log('\n📁 Testing Projects endpoints...\n');

  // Create project
  const createResult = await makeRequest('POST', '/manage/projects', {
    name: `Test Project ${Date.now()}`,
    domain: 'https://example.com',
    cors: ['https://example.com', 'https://www.example.com'],
    crossDomain: false,
    types: ['website'],
  });
  results.push(createResult);
  console.log(
    `✓ POST /manage/projects: ${createResult.success ? '✅' : '❌'} ${createResult.status}`,
  );
  if (createResult.error) console.log(`  Error: ${createResult.error}`);

  const projectId = createResult.data?.data?.id;
  const clientId = createResult.data?.data?.client?.id;
  const clientSecret = createResult.data?.data?.client?.secret;

  if (projectId) {
    console.log(`  Created project: ${projectId}`);
    if (clientId) console.log(`  Created client: ${clientId}`);
    if (clientSecret) console.log(`  Client secret: ${clientSecret}`);
  }

  // List projects
  const listResult = await makeRequest('GET', '/manage/projects');
  results.push(listResult);
  console.log(
    `✓ GET /manage/projects: ${listResult.success ? '✅' : '❌'} ${listResult.status}`,
  );
  if (listResult.data?.data?.length) {
    console.log(`  Found ${listResult.data.data.length} projects`);
  }

  if (projectId) {
    // Get project
    const getResult = await makeRequest('GET', `/manage/projects/${projectId}`);
    results.push(getResult);
    console.log(
      `✓ GET /manage/projects/:id: ${getResult.success ? '✅' : '❌'} ${getResult.status}`,
    );

    // Update project
    const updateResult = await makeRequest(
      'PATCH',
      `/manage/projects/${projectId}`,
      {
        name: 'Updated Test Project',
        crossDomain: true,
      },
    );
    results.push(updateResult);
    console.log(
      `✓ PATCH /manage/projects/:id: ${updateResult.success ? '✅' : '❌'} ${updateResult.status}`,
    );

    // Delete project (soft delete)
    const deleteResult = await makeRequest(
      'DELETE',
      `/manage/projects/${projectId}`,
    );
    results.push(deleteResult);
    console.log(
      `✓ DELETE /manage/projects/:id: ${deleteResult.success ? '✅' : '❌'} ${deleteResult.status}`,
    );
  }

  return { projectId, clientId };
}

async function testClients(projectId?: string) {
  console.log('\n🔑 Testing Clients endpoints...\n');

  // Create client
  const createResult = await makeRequest('POST', '/manage/clients', {
    name: `Test Client ${Date.now()}`,
    projectId: projectId || undefined,
    type: 'read',
  });
  results.push(createResult);
  console.log(
    `✓ POST /manage/clients: ${createResult.success ? '✅' : '❌'} ${createResult.status}`,
  );
  if (createResult.error) console.log(`  Error: ${createResult.error}`);

  const clientId = createResult.data?.data?.id;
  const clientSecret = createResult.data?.data?.secret;

  if (clientId) {
    console.log(`  Created client: ${clientId}`);
    if (clientSecret) console.log(`  Client secret: ${clientSecret}`);
  }

  // List clients
  const listResult = await makeRequest(
    'GET',
    projectId ? `/manage/clients?projectId=${projectId}` : '/manage/clients',
  );
  results.push(listResult);
  console.log(
    `✓ GET /manage/clients: ${listResult.success ? '✅' : '❌'} ${listResult.status}`,
  );
  if (listResult.data?.data?.length) {
    console.log(`  Found ${listResult.data.data.length} clients`);
  }

  if (clientId) {
    // Get client
    const getResult = await makeRequest('GET', `/manage/clients/${clientId}`);
    results.push(getResult);
    console.log(
      `✓ GET /manage/clients/:id: ${getResult.success ? '✅' : '❌'} ${getResult.status}`,
    );

    // Update client
    const updateResult = await makeRequest(
      'PATCH',
      `/manage/clients/${clientId}`,
      {
        name: 'Updated Test Client',
      },
    );
    results.push(updateResult);
    console.log(
      `✓ PATCH /manage/clients/:id: ${updateResult.success ? '✅' : '❌'} ${updateResult.status}`,
    );

    // Delete client
    const deleteResult = await makeRequest(
      'DELETE',
      `/manage/clients/${clientId}`,
    );
    results.push(deleteResult);
    console.log(
      `✓ DELETE /manage/clients/:id: ${deleteResult.success ? '✅' : '❌'} ${deleteResult.status}`,
    );
  }
}

async function testReferences(projectId?: string) {
  console.log('\n📚 Testing References endpoints...\n');

  if (!projectId) {
    console.log('  ⚠️  Skipping references tests - no project ID available');
    return;
  }

  // Create reference
  const createResult = await makeRequest('POST', '/manage/references', {
    projectId,
    title: `Test Reference ${Date.now()}`,
    description: 'This is a test reference',
    datetime: new Date().toISOString(),
  });
  results.push(createResult);
  console.log(
    `✓ POST /manage/references: ${createResult.success ? '✅' : '❌'} ${createResult.status}`,
  );
  if (createResult.error) console.log(`  Error: ${createResult.error}`);

  const referenceId = createResult.data?.data?.id;

  if (referenceId) {
    console.log(`  Created reference: ${referenceId}`);
  }

  // List references
  const listResult = await makeRequest(
    'GET',
    `/manage/references?projectId=${projectId}`,
  );
  results.push(listResult);
  console.log(
    `✓ GET /manage/references: ${listResult.success ? '✅' : '❌'} ${listResult.status}`,
  );
  if (listResult.data?.data?.length) {
    console.log(`  Found ${listResult.data.data.length} references`);
  }

  if (referenceId) {
    // Get reference
    const getResult = await makeRequest(
      'GET',
      `/manage/references/${referenceId}`,
    );
    results.push(getResult);
    console.log(
      `✓ GET /manage/references/:id: ${getResult.success ? '✅' : '❌'} ${getResult.status}`,
    );

    // Update reference
    const updateResult = await makeRequest(
      'PATCH',
      `/manage/references/${referenceId}`,
      {
        title: 'Updated Test Reference',
        description: 'Updated description',
        datetime: new Date().toISOString(),
      },
    );
    results.push(updateResult);
    console.log(
      `✓ PATCH /manage/references/:id: ${updateResult.success ? '✅' : '❌'} ${updateResult.status}`,
    );

    // Delete reference
    const deleteResult = await makeRequest(
      'DELETE',
      `/manage/references/${referenceId}`,
    );
    results.push(deleteResult);
    console.log(
      `✓ DELETE /manage/references/:id: ${deleteResult.success ? '✅' : '❌'} ${deleteResult.status}`,
    );
  }
}

async function main() {
  console.log('🚀 Testing Manage API Endpoints\n');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Client ID: ${CLIENT_ID}\n`);

  try {
    // Test projects first (creates a project we can use for other tests)
    const { projectId } = await testProjects();

    // Test clients
    await testClients(projectId);

    // Test references (requires a project)
    await testReferences(projectId);

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 Test Summary\n');
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`Total tests: ${results.length}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}\n`);

    if (failed > 0) {
      console.log('Failed tests:');
      results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  ❌ ${r.name} (${r.status})`);
          if (r.error) console.log(`     Error: ${r.error}`);
        });
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
