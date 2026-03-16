import https from 'node:https';
import http from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig, resolveApiUrl, resolveApiKey } from '../config/config.js';

interface Test {
  id: string;
  name: string;
  description: string;
  targetUrl: string;
  isPublished: boolean;
  requiresHumanInput: boolean;
  testType: string;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TestDetails extends Test {
  config: any;
  steps: any;
  authProfile: { id: string; name: string; authType: string } | null;
  recentRuns: Array<{
    id: string;
    status: string;
    durationMs: number | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

interface ListTestsResponse {
  tests: Test[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  error?: string;
}

interface GetTestResponse extends TestDetails {
  error?: string;
}

async function makeApiRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  apiKey: string,
  apiUrl: string
): Promise<{ ok: boolean; data: T; status: number }> {
  return new Promise((resolve) => {
    try {
      // If apiUrl is an API subdomain (api.*), strip /api prefix from path to avoid double /api/api/
    let normalizedPath = path;
    try {
      const baseHost = new URL(apiUrl).hostname;
      if (baseHost.startsWith('api.') && path.startsWith('/api/')) {
        normalizedPath = path.slice(4); // Remove /api prefix
      }
    } catch {}
    const urlObj = new URL(normalizedPath, apiUrl);
      const requestModule = urlObj.protocol === 'https:' ? https : http;

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Kagura-Api-Key': apiKey,
        },
      };

      const req = requestModule.request(urlObj, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ ok: res.statusCode === 200, data: parsed, status: res.statusCode || 500 });
          } catch {
            resolve({ ok: false, data: { error: 'Invalid JSON response' } as T, status: res.statusCode || 500 });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, data: { error: err.message } as T, status: 0 });
      });

      req.end();
    } catch (err: any) {
      resolve({ ok: false, data: { error: err.message } as T, status: 0 });
    }
  });
}

/**
 * List all tests (cloud mode only)
 */
export async function listTestsCommand(args: {
  published?: boolean;
  passing?: boolean;
  limit?: number;
  search?: string;
}): Promise<number> {
  console.log('');

  const config = await loadCliConfig();

  if (config.mode !== 'cloud') {
    p.log.error(pc.red('This command requires cloud mode. Run `kagura mode cloud` first.'));
    return 1;
  }

  const apiUrl = resolveApiUrl(config);
  const apiKey = resolveApiKey(config);

  if (!apiKey) {
    p.log.error(pc.red('No API key configured. Run `kagura setup` first.'));
    return 1;
  }

  p.intro(pc.red(pc.bold(' Kagura Tests ')));

  const s = p.spinner();
  s.start('Fetching tests...');

  // Build query string
  const params = new URLSearchParams();
  if (args.published !== undefined) params.set('published', String(args.published));
  if (args.passing !== undefined) params.set('passing', String(args.passing));
  if (args.limit) params.set('limit', String(args.limit));
  if (args.search) params.set('search', args.search);

  const queryString = params.toString();
  const path = `/api/v1/tests${queryString ? `?${queryString}` : ''}`;

  const response = await makeApiRequest<ListTestsResponse>('GET', path, apiKey, apiUrl);

  s.stop('Done');

  if (!response.ok) {
    p.log.error(pc.red(`Error: ${response.data.error || 'Failed to fetch tests'}`));
    return 1;
  }

  const { tests, pagination } = response.data;

  if (tests.length === 0) {
    p.log.warn(pc.yellow('No tests found.'));
    p.outro('');
    return 0;
  }

  console.log('');
  console.log(pc.bold(`  Tests (${pagination.total} total):`));
  console.log('');

  for (const test of tests) {
    const publishedBadge = test.isPublished ? pc.green('✓ published') : pc.gray('draft');
    const statusIcon = test.lastRunStatus === 'passed' 
      ? pc.green('●') 
      : test.lastRunStatus === 'failed' 
        ? pc.red('●') 
        : pc.gray('○');
    
    console.log(`  ${statusIcon} ${pc.white(test.name)} ${pc.gray(`(${test.id.slice(0, 8)}...)`)}`);
    console.log(`    ${pc.gray(test.targetUrl)} · ${publishedBadge}`);
    if (test.requiresHumanInput) {
      console.log(`    ${pc.yellow('⚠ requires human input')}`);
    }
    console.log('');
  }

  if (pagination.hasMore) {
    p.log.message(pc.gray(`Showing ${tests.length} of ${pagination.total}. Use --limit to see more.`));
  }

  p.outro('');
  return 0;
}

/**
 * Get details of a single test (cloud mode only)
 */
export async function getTestCommand(args: { testId: string }): Promise<number> {
  console.log('');

  const config = await loadCliConfig();

  if (config.mode !== 'cloud') {
    p.log.error(pc.red('This command requires cloud mode. Run `kagura mode cloud` first.'));
    return 1;
  }

  const apiUrl = resolveApiUrl(config);
  const apiKey = resolveApiKey(config);

  if (!apiKey) {
    p.log.error(pc.red('No API key configured. Run `kagura setup` first.'));
    return 1;
  }

  p.intro(pc.red(pc.bold(' Kagura Test Details ')));

  const s = p.spinner();
  s.start('Fetching test...');

  const response = await makeApiRequest<GetTestResponse>(
    'GET',
    `/api/v1/tests/${args.testId}`,
    apiKey,
    apiUrl
  );

  s.stop('Done');

  if (!response.ok) {
    if (response.status === 404) {
      p.log.error(pc.red('Test not found.'));
    } else {
      p.log.error(pc.red(`Error: ${response.data.error || 'Failed to fetch test'}`));
    }
    return 1;
  }

  const test = response.data;

  console.log('');
  console.log(`  ${pc.bold(test.name)}`);
  console.log(`  ${pc.gray('ID:')} ${test.id}`);
  console.log(`  ${pc.gray('URL:')} ${test.targetUrl}`);
  console.log(`  ${pc.gray('Type:')} ${test.testType || 'default'}`);
  console.log(`  ${pc.gray('Published:')} ${test.isPublished ? pc.green('Yes') : pc.yellow('No')}`);
  console.log(`  ${pc.gray('Requires Input:')} ${test.requiresHumanInput ? pc.yellow('Yes') : 'No'}`);
  
  if (test.authProfile) {
    console.log(`  ${pc.gray('Auth Profile:')} ${test.authProfile.name} (${test.authProfile.authType})`);
  }

  if (test.description) {
    console.log('');
    console.log(`  ${pc.gray('Description:')}`);
    console.log(`  ${test.description}`);
  }

  if (test.recentRuns && test.recentRuns.length > 0) {
    console.log('');
    console.log(`  ${pc.bold('Recent Runs:')}`);
    for (const run of test.recentRuns.slice(0, 5)) {
      const icon = run.status === 'passed' ? pc.green('✓') : pc.red('✗');
      const duration = run.durationMs ? pc.gray(`${(run.durationMs / 1000).toFixed(1)}s`) : '';
      const date = new Date(run.createdAt).toLocaleDateString();
      console.log(`    ${icon} ${run.status} ${duration} ${pc.gray(`- ${date}`)}`);
    }
  }

  console.log('');
  p.outro('');
  return 0;
}
