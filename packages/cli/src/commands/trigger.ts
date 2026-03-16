import https from 'node:https';
import http from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig, resolveApiUrl, resolveAppUrl, resolveApiKey } from '../config/config.js';

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
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  progress: number;
  total: number;
  passed: number;
  failed: number;
  startedAt?: string;
  error?: string;
  pausedTests?: Array<{
    testId: string;
    testName: string;
    question: string;
    resultId: string;
  }>;
}

interface ResultsResponse {
  runId: string;
  status: string;
  tests: Array<{
    id: string;
    testId: string;
    name: string;
    status: string;
    durationMs: number | null;
    error?: string | null;
    aiSummary?: string | null;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    completed: number;
  };
  timing?: {
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  error?: string;
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
 * Trigger published tests by ID(s)
 */
export async function triggerCommand(args: { testIds?: string[]; groupId?: string; wait?: boolean }): Promise<number> {
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

  if ((!args.testIds || args.testIds.length === 0) && !args.groupId) {
    p.log.error(pc.red('Either --test-id or --group-id is required.'));
    return 1;
  }

  p.intro(pc.red(pc.bold(' Kagura Trigger ')));

  const s = p.spinner();
  s.start('Triggering test run...');

  const body: Record<string, any> = {};
  if (args.testIds && args.testIds.length > 0) {
    body.testIds = args.testIds;
    if (args.testIds.length === 1) {
      p.log.message(`${pc.gray('Test ID:')} ${pc.white(args.testIds[0])}`);
    } else {
      p.log.message(`${pc.gray('Test IDs:')} ${pc.white(args.testIds.length + ' tests')}`);
      for (const id of args.testIds) {
        p.log.message(`  ${pc.gray('•')} ${pc.white(id)}`);
      }
    }
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

    // Check if any tests are paused waiting for user input
    if (status.status === 'paused' || (status.pausedTests && status.pausedTests.length > 0)) {
      s.stop('Test paused - requires input');
      
      for (const paused of status.pausedTests || []) {
        console.log('');
        p.log.warn(pc.yellow(`Test "${paused.testName}" needs your input:`));
        console.log('');
        console.log(`  ${pc.cyan(paused.question)}`);
        console.log('');
        
        const response = await p.text({
          message: 'Your response:',
          placeholder: 'Type your answer...',
        });
        
        if (p.isCancel(response)) {
          p.log.warn(pc.yellow('Cancelled. Test will remain paused.'));
          return 2;
        }
        
        // Submit the response
        s.start('Submitting response...');
        const submitRes = await makeApiRequest<{ success: boolean; error?: string }>(
          'POST',
          `/api/v1/tests/${paused.testId}/respond`,
          apiKey,
          apiUrl,
          {
            resultId: paused.resultId,
            response: response as string,
          }
        );
        
        if (!submitRes.ok) {
          s.stop('Failed to submit');
          p.log.error(pc.red(`Failed to submit response: ${submitRes.data.error || 'Unknown error'}`));
          return 1;
        }
        
        s.message('Response submitted, continuing...');
      }
      
      // Continue polling after responding
      continue;
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

      if (resultsRes.ok && resultsRes.data.tests) {
        console.log('');
        p.log.message(pc.bold('Test Results:'));
        console.log('');
        for (const test of resultsRes.data.tests) {
          const icon = test.status === 'passed' ? pc.green('✓') : pc.red('✗');
          const duration = test.durationMs ? pc.gray(`(${(test.durationMs / 1000).toFixed(1)}s)`) : '';
          console.log(`  ${icon} ${test.name} ${duration}`);
          if (test.error) {
            console.log(`    ${pc.red(test.error)}`);
          }
          if (test.aiSummary) {
            console.log('');
            p.note(test.aiSummary, `AI Summary: ${test.name}`);
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

  if (data.tests && data.tests.length > 0) {
    console.log(pc.bold('  Test Results:'));
    console.log('');
    for (const test of data.tests) {
      const icon = test.status === 'passed' ? pc.green('✓') : pc.red('✗');
      const duration = test.durationMs ? pc.gray(`(${(test.durationMs / 1000).toFixed(1)}s)`) : '';
      console.log(`    ${icon} ${test.name} ${duration}`);
      if (test.error) {
        console.log(`      ${pc.red(test.error)}`);
      }
      if (test.aiSummary) {
        console.log('');
        p.note(test.aiSummary, `AI Summary: ${test.name}`);
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
