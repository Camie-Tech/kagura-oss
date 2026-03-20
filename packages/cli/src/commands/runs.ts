import https from 'node:https';
import http from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig, resolveApiUrl, resolveApiKey } from '../config/config.js';
import { loadLocalRuns, getRunStatus, getRunDurationMs, formatDuration } from './tests.js';
import { kaguraStateDir } from '../config/paths.js';

interface Run {
  id: string;
  status: string;
  testsTotal: number;
  testsCompleted: number;
  testsPassed: number;
  testsFailed: number;
  targetUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface ListRunsResponse {
  runs: Run[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  error?: string;
}

interface CancelRunResponse {
  success?: boolean;
  message?: string;
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

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return pc.green(status);
    case 'running': return pc.blue(status);
    case 'queued': return pc.yellow(status);
    case 'failed': return pc.red(status);
    case 'cancelled': return pc.gray(status);
    case 'paused': return pc.magenta(status);
    default: return status;
  }
}

/**
 * List recent runs (local + cloud mode)
 */
export async function listRunsCommand(args: {
  status?: string;
  limit?: number;
}): Promise<number> {
  console.log('');

  const config = await loadCliConfig();

  // ── Local mode ──────────────────────────────────────────────────────
  if (config.mode !== 'cloud') {
    p.intro(pc.red(pc.bold(' Kagura Runs (Local) ')));

    const s = p.spinner();
    s.start('Reading local state...');

    let runs = await loadLocalRuns();

    s.stop('Done');

    // Apply status filter
    if (args.status) {
      const filter = args.status.toLowerCase();
      runs = runs.filter(r => {
        const st = getRunStatus(r);
        return st === filter;
      });
    }

    const isFiltered = !!args.status;
    const total = runs.length;
    const limit = args.limit || 20;
    runs = runs.slice(0, limit);

    if (runs.length === 0) {
      p.log.warn(pc.yellow('No local runs found.'));
      p.outro(pc.gray(`State dir: ${kaguraStateDir()}`));
      return 0;
    }

    console.log('');
    console.log(pc.bold(`  Recent Runs (${total} total${isFiltered ? ', filtered' : ''}):`));
    console.log('');

    for (const run of runs) {
      const status = getRunStatus(run);
      const statusLabel = status === 'passed'
        ? pc.green('passed')
        : status === 'failed'
          ? pc.red('failed')
          : pc.gray('no-steps');

      const date = new Date(run.startedAt).toLocaleString();
      const duration = formatDuration(getRunDurationMs(run));
      const passed = run.steps.filter(s => s.status === 'success').length;
      const failed = run.steps.filter(s => s.status === 'failed').length;

      console.log(`  ${pc.cyan(run.runId.slice(0, 8))}  ${statusLabel}  ${pc.gray(duration)}`);
      console.log(`    ${pc.green(String(passed))} passed, ${failed > 0 ? pc.red(String(failed)) : '0'} failed  ${pc.gray('·')}  ${pc.gray(run.currentUrl)}`);
      console.log(`    ${pc.gray(date)}`);
      console.log('');
    }

    if (total > limit) {
      const suffix = isFiltered ? ' (filtered)' : '';
      p.log.message(pc.gray(`Showing ${runs.length} of ${total} runs${suffix}. Use --limit to see more.`));
    }

    p.outro(pc.gray(`State dir: ${kaguraStateDir()}`));
    return 0;
  }

  // ── Cloud mode ──────────────────────────────────────────────────────
  const apiUrl = resolveApiUrl(config);
  const apiKey = resolveApiKey(config);

  if (!apiKey) {
    p.log.error(pc.red('No API key configured. Run `kagura setup` first.'));
    return 1;
  }

  p.intro(pc.red(pc.bold(' Kagura Runs ')));

  const s = p.spinner();
  s.start('Fetching runs...');

  // Build query string
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status);
  if (args.limit) params.set('limit', String(args.limit));

  const queryString = params.toString();
  const apiPath = `/api/v1/runs${queryString ? `?${queryString}` : ''}`;

  const response = await makeApiRequest<ListRunsResponse>('GET', apiPath, apiKey, apiUrl);

  s.stop('Done');

  if (!response.ok) {
    p.log.error(pc.red(`Error: ${response.data.error || 'Failed to fetch runs'}`));
    return 1;
  }

  const { runs, pagination } = response.data;

  if (runs.length === 0) {
    p.log.warn(pc.yellow('No runs found.'));
    p.outro('');
    return 0;
  }

  console.log('');
  console.log(pc.bold(`  Recent Runs (${pagination.total} total):`));
  console.log('');

  for (const run of runs) {
    const date = new Date(run.createdAt).toLocaleString();
    const progress = run.testsTotal > 0
      ? `${run.testsCompleted}/${run.testsTotal}`
      : '0/0';
    const passRate = run.testsCompleted > 0
      ? `${run.testsPassed} passed, ${run.testsFailed} failed`
      : '';

    console.log(`  ${pc.gray(run.id.slice(0, 8))}  ${getStatusColor(run.status)}  ${pc.gray(progress)}`);
    if (passRate) {
      console.log(`    ${pc.green(String(run.testsPassed))} passed, ${run.testsFailed > 0 ? pc.red(String(run.testsFailed)) : '0'} failed`);
    }
    console.log(`    ${pc.gray(date)}`);
    console.log('');
  }

  if (pagination.hasMore) {
    p.log.message(pc.gray(`Showing ${runs.length} of ${pagination.total}. Use --limit to see more.`));
  }

  p.outro('');
  return 0;
}

/**
 * Cancel a running test run (cloud mode only)
 */
export async function cancelRunCommand(args: { runId: string }): Promise<number> {
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

  p.intro(pc.red(pc.bold(' Kagura Cancel Run ')));

  const confirm = await p.confirm({
    message: `Cancel run ${args.runId}?`,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.log.warn(pc.yellow('Cancelled.'));
    return 0;
  }

  const s = p.spinner();
  s.start('Cancelling run...');

  const response = await makeApiRequest<CancelRunResponse>(
    'DELETE',
    `/api/v1/runs/${args.runId}`,
    apiKey,
    apiUrl
  );

  s.stop('Done');

  if (!response.ok) {
    if (response.status === 404) {
      p.log.error(pc.red('Run not found.'));
    } else if (response.status === 400) {
      p.log.error(pc.red(response.data.error || 'Cannot cancel this run.'));
    } else {
      p.log.error(pc.red(`Error: ${response.data.error || 'Failed to cancel run'}`));
    }
    return 1;
  }

  p.log.success(pc.green('Run cancelled successfully.'));
  p.outro('');
  return 0;
}
