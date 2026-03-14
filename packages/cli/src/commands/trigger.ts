import https from 'node:https';
import http from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig, resolveApiUrl, resolveApiKey } from '../config/config.js';

interface TriggerResponse {
  runId?: string;
  status?: string;
  testCount?: number;
  error?: string;
  code?: string;
  unpublishedTests?: Array<{ id: string; name: string }>;
}

interface StatusResponse {
  runId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total: number;
  passed: number;
  failed: number;
  startedAt?: string;
}

interface ResultsResponse {
  runId: string;
  status: string;
  results: Array<{
    testId: string;
    testName: string;
    status: string;
    durationMs: number;
    error?: string;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
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
            resolve({ ok: res.statusCode === 200 || res.statusCode === 202, data: parsed, status: res.statusCode || 500 });
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
 * Trigger a published test by ID
 */
export async function triggerCommand(args: { testId?: string; groupId?: string; wait?: boolean }): Promise<number> {
  console.log('');
  
  const config = await loadCliConfig();
  
  if (config.mode !== 'cloud') {
    p.log.error(pc.red('Trigger command requires cloud mode. Run `kagura mode cloud` first.'));
    return 1;
  }

  const apiUrl = resolveApiUrl(config);
  const apiKey = resolveApiKey(config);

  if (!apiKey) {
    p.log.error(pc.red('No API key configured. Run `kagura setup` first.'));
    return 1;
  }

  if (!args.testId && !args.groupId) {
    p.log.error(pc.red('Either --test-id or --group-id is required.'));
    return 1;
  }

  p.intro(pc.red(pc.bold(' Kagura Trigger ')));

  const s = p.spinner();
  s.start('Triggering test run...');

  const body: Record<string, any> = {};
  if (args.testId) {
    body.testIds = [args.testId];
    p.log.message(`${pc.gray('Test ID:')} ${pc.white(args.testId)}`);
  }
  if (args.groupId) {
    body.testGroupId = args.groupId;
    p.log.message(`${pc.gray('Group ID:')} ${pc.white(args.groupId)}`);
  }

  const response = await makeApiRequest<TriggerResponse>(
    'POST',
    '/api/v1/tests/trigger',
    apiKey,
    apiUrl,
    body
  );

  if (!response.ok) {
    s.stop('Trigger failed');
    
    if (response.status === 401) {
      p.log.error(pc.red('Authentication failed. Your API key may be invalid.'));
    } else if (response.data.code === 'TESTS_NOT_PUBLISHED') {
      p.log.error(pc.red('Tests must be published before triggering via API.'));
      if (response.data.unpublishedTests) {
        for (const t of response.data.unpublishedTests) {
          p.log.message(pc.yellow(`  • ${t.name} (${t.id})`));
        }
      }
    } else {
      p.log.error(pc.red(`Error: ${response.data.error || 'Unknown error'}`));
    }
    return 1;
  }

  const runId = response.data.runId;
  if (!runId) {
    s.stop('No run ID returned');
    return 1;
  }

  s.stop('Run triggered');
  p.log.success(pc.green(`Run ID: ${runId}`));

  // If wait flag, poll for completion
  if (args.wait !== false) {
    return await pollForCompletion(runId, apiKey, apiUrl);
  }

  p.note(
    `${pc.gray('Check status:')} kagura status --run-id ${runId}\n${pc.gray('Get results:')}  kagura results --run-id ${runId}`,
    'Next Steps'
  );

  p.outro(pc.cyan('Run triggered successfully'));
  return 0;
}

async function pollForCompletion(runId: string, apiKey: string, apiUrl: string): Promise<number> {
  const s = p.spinner();
  s.start('Waiting for completion...');

  const maxWaitMs = 10 * 60 * 1000; // 10 minutes
  const pollIntervalMs = 5000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollIntervalMs));

    const statusRes = await makeApiRequest<StatusResponse>(
      'GET',
      `/api/v1/runs/${runId}/status`,
      apiKey,
      apiUrl
    );

    if (!statusRes.ok) continue;

    const status = statusRes.data;
    
    if (status.total > 0) {
      const pct = Math.round((status.progress / status.total) * 100);
      s.message(`Progress: ${status.progress}/${status.total} (${pct}%) - ${status.passed} passed, ${status.failed} failed`);
    }

    if (['completed', 'failed', 'cancelled'].includes(status.status)) {
      s.stop('Run completed');
      
      // Fetch and display results
      const resultsRes = await makeApiRequest<ResultsResponse>(
        'GET',
        `/api/v1/runs/${runId}/results`,
        apiKey,
        apiUrl
      );

      if (resultsRes.ok && resultsRes.data.results) {
        console.log('');
        for (const result of resultsRes.data.results) {
          const icon = result.status === 'passed' ? pc.green('✓') : pc.red('✗');
          const duration = result.durationMs ? pc.gray(`(${(result.durationMs / 1000).toFixed(1)}s)`) : '';
          console.log(`  ${icon} ${result.testName} ${duration}`);
          if (result.error) {
            console.log(`    ${pc.red(result.error)}`);
          }
        }
        console.log('');
        
        const summary = resultsRes.data.summary;
        if (summary.failed > 0) {
          p.log.error(pc.red(`${summary.failed} of ${summary.total} tests failed`));
        } else {
          p.log.success(pc.green(`All ${summary.total} tests passed!`));
        }
      }

      p.outro(status.failed > 0 ? pc.red('Some tests failed') : pc.green('Done!'));
      return status.failed > 0 ? 1 : 0;
    }
  }

  s.stop('Timed out');
  p.log.warn(pc.yellow('Timed out waiting for completion. Check status manually.'));
  return 2;
}

/**
 * Get status of a run
 */
export async function statusCommand(args: { runId: string }): Promise<number> {
  console.log('');
  
  const config = await loadCliConfig();
  const apiUrl = resolveApiUrl(config);
  const apiKey = resolveApiKey(config);

  if (!apiKey) {
    p.log.error(pc.red('No API key configured. Run `kagura setup` first.'));
    return 1;
  }

  p.intro(pc.red(pc.bold(' Kagura Status ')));

  const s = p.spinner();
  s.start('Fetching status...');

  const response = await makeApiRequest<StatusResponse>(
    'GET',
    `/api/v1/runs/${args.runId}/status`,
    apiKey,
    apiUrl
  );

  s.stop('Done');

  if (!response.ok) {
    p.log.error(pc.red(`Error: ${response.data.error || 'Failed to fetch status'}`));
    return 1;
  }

  const status = response.data;

  console.log('');
  console.log(`  ${pc.gray('Run ID:')}    ${status.runId}`);
  console.log(`  ${pc.gray('Status:')}    ${getStatusColor(status.status)}`);
  console.log(`  ${pc.gray('Progress:')}  ${status.progress}/${status.total}`);
  console.log(`  ${pc.gray('Passed:')}    ${pc.green(String(status.passed))}`);
  console.log(`  ${pc.gray('Failed:')}    ${status.failed > 0 ? pc.red(String(status.failed)) : '0'}`);
  console.log('');

  p.outro('');
  return 0;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return pc.green(status);
    case 'running': return pc.blue(status);
    case 'queued': return pc.yellow(status);
    case 'failed': return pc.red(status);
    case 'cancelled': return pc.gray(status);
    default: return status;
  }
}

/**
 * Get results of a run
 */
export async function resultsCommand(args: { runId: string }): Promise<number> {
  console.log('');
  
  const config = await loadCliConfig();
  const apiUrl = resolveApiUrl(config);
  const apiKey = resolveApiKey(config);

  if (!apiKey) {
    p.log.error(pc.red('No API key configured. Run `kagura setup` first.'));
    return 1;
  }

  p.intro(pc.red(pc.bold(' Kagura Results ')));

  const s = p.spinner();
  s.start('Fetching results...');

  const response = await makeApiRequest<ResultsResponse>(
    'GET',
    `/api/v1/runs/${args.runId}/results`,
    apiKey,
    apiUrl
  );

  s.stop('Done');

  if (!response.ok) {
    p.log.error(pc.red(`Error: ${response.data.error || 'Failed to fetch results'}`));
    return 1;
  }

  const data = response.data;

  console.log('');
  console.log(`  ${pc.gray('Run ID:')} ${data.runId}`);
  console.log(`  ${pc.gray('Status:')} ${getStatusColor(data.status)}`);
  console.log('');

  if (data.results && data.results.length > 0) {
    console.log(pc.bold('  Test Results:'));
    console.log('');
    for (const result of data.results) {
      const icon = result.status === 'passed' ? pc.green('✓') : pc.red('✗');
      const duration = result.durationMs ? pc.gray(`(${(result.durationMs / 1000).toFixed(1)}s)`) : '';
      console.log(`    ${icon} ${result.testName} ${duration}`);
      if (result.error) {
        console.log(`      ${pc.red(result.error)}`);
      }
    }
    console.log('');
  }

  if (data.summary) {
    const { total, passed, failed } = data.summary;
    console.log(`  ${pc.gray('Summary:')} ${pc.green(`${passed} passed`)}, ${failed > 0 ? pc.red(`${failed} failed`) : '0 failed'} of ${total} total`);
    console.log('');
  }

  p.outro('');
  return data.summary?.failed > 0 ? 1 : 0;
}
