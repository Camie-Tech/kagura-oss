import https from 'node:https';
import http from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig, resolveApiUrl, resolveApiKey } from '../config/config.js';

interface TestGroup {
  id: string;
  name: string;
  description: string | null;
  testCount: number;
  publishedCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ListGroupsResponse {
  groups: TestGroup[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  error?: string;
}

interface TriggerGroupResponse {
  runId?: string;
  status?: string;
  groupId?: string;
  groupName?: string;
  testsQueued?: number;
  error?: string;
  code?: string;
}

async function makeApiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  apiKey: string,
  apiUrl: string,
  body?: object
): Promise<{ ok: boolean; data: T; status: number }> {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(path, apiUrl);
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
            resolve({ 
              ok: res.statusCode === 200 || res.statusCode === 202, 
              data: parsed, 
              status: res.statusCode || 500 
            });
          } catch {
            resolve({ ok: false, data: { error: 'Invalid JSON response' } as T, status: res.statusCode || 500 });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, data: { error: err.message } as T, status: 0 });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    } catch (err: any) {
      resolve({ ok: false, data: { error: err.message } as T, status: 0 });
    }
  });
}

/**
 * List all test groups (cloud mode only)
 */
export async function listGroupsCommand(args: { limit?: number }): Promise<number> {
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

  p.intro(pc.red(pc.bold(' Kagura Test Groups ')));

  const s = p.spinner();
  s.start('Fetching test groups...');

  const params = new URLSearchParams();
  if (args.limit) params.set('limit', String(args.limit));

  const queryString = params.toString();
  const path = `/api/v1/test-groups${queryString ? `?${queryString}` : ''}`;

  const response = await makeApiRequest<ListGroupsResponse>('GET', path, apiKey, apiUrl);

  s.stop('Done');

  if (!response.ok) {
    p.log.error(pc.red(`Error: ${response.data.error || 'Failed to fetch test groups'}`));
    return 1;
  }

  const { groups, pagination } = response.data;

  if (groups.length === 0) {
    p.log.warn(pc.yellow('No test groups found.'));
    p.outro('');
    return 0;
  }

  console.log('');
  console.log(pc.bold(`  Test Groups (${pagination.total} total):`));
  console.log('');

  for (const group of groups) {
    const publishedInfo = `${group.publishedCount}/${group.testCount} published`;
    
    console.log(`  ${pc.white(group.name)} ${pc.gray(`(${group.id.slice(0, 8)}...)`)}`);
    console.log(`    ${pc.gray(publishedInfo)}`);
    if (group.description) {
      console.log(`    ${pc.gray(group.description)}`);
    }
    console.log('');
  }

  if (pagination.hasMore) {
    p.log.message(pc.gray(`Showing ${groups.length} of ${pagination.total}. Use --limit to see more.`));
  }

  p.outro('');
  return 0;
}

/**
 * Trigger all published tests in a group (cloud mode only)
 */
export async function triggerGroupCommand(args: { groupId: string; wait?: boolean }): Promise<number> {
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

  p.intro(pc.red(pc.bold(' Kagura Trigger Group ')));

  const s = p.spinner();
  s.start('Triggering test group...');

  const response = await makeApiRequest<TriggerGroupResponse>(
    'POST',
    `/api/v1/test-groups/${args.groupId}/trigger`,
    apiKey,
    apiUrl,
    {}
  );

  if (!response.ok) {
    s.stop('Trigger failed');

    if (response.status === 404) {
      p.log.error(pc.red('Test group not found.'));
    } else if (response.data.code === 'NO_PUBLISHED_TESTS') {
      p.log.error(pc.red('No published tests in this group.'));
    } else {
      p.log.error(pc.red(`Error: ${response.data.error || 'Failed to trigger group'}`));
    }
    return 1;
  }

  const { runId, groupName, testsQueued } = response.data;

  s.stop('Triggered');
  p.log.success(pc.green(`Triggered ${testsQueued} tests from "${groupName}"`));
  p.log.message(`${pc.gray('Run ID:')} ${runId}`);

  if (args.wait !== false && runId) {
    // Import and use the polling function from trigger.ts
    // For now, just show the command
    p.note(
      `${pc.gray('Check status:')} kagura status --run-id ${runId}\n${pc.gray('Get results:')}  kagura results --run-id ${runId}`,
      'Next Steps'
    );
  }

  p.outro(pc.cyan('Group triggered successfully'));
  return 0;
}
