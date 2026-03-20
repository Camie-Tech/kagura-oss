import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig, resolveApiUrl, resolveApiKey } from '../config/config.js';
import { kaguraStateDir } from '../config/paths.js';

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

// ── Local state helpers ───────────────────────────────────────────────────

export interface LocalRun {
  runId: string;
  currentUrl: string;
  startedAt: string;
  updatedAt: string;
  steps: Array<{
    index: number;
    action: string;
    description: string;
    status: 'success' | 'failed' | 'skipped';
    errorMessage?: string;
    screenshotUrl?: string;
    durationMs: number;
  }>;
  screenshots: Array<{ url: string; stepIndex?: number; label?: string; createdAt?: number }>;
  metadata?: Record<string, any>;
}

export async function loadLocalRuns(): Promise<LocalRun[]> {
  const dir = kaguraStateDir();
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const runs: LocalRun[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf8');
      runs.push(JSON.parse(raw));
    } catch {
      // skip corrupt files
    }
  }

  // Sort newest first
  runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return runs;
}

export function getRunStatus(run: LocalRun): 'passed' | 'failed' | 'no-steps' {
  if (run.steps.length === 0) return 'no-steps';
  const hasFailed = run.steps.some(s => s.status === 'failed');
  return hasFailed ? 'failed' : 'passed';
}

export function getRunDurationMs(run: LocalRun): number {
  return run.steps.reduce((sum, s) => sum + (s.durationMs || 0), 0);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.floor(secs % 60);
  return `${mins}m ${remSecs}s`;
}

// ── List tests command ────────────────────────────────────────────────────

/**
 * List all tests (local + cloud mode)
 */
export async function listTestsCommand(args: {
  published?: boolean;
  passing?: boolean;
  limit?: number;
  search?: string;
  status?: string;
}): Promise<number> {
  console.log('');

  const config = await loadCliConfig();

  // ── Local mode ──────────────────────────────────────────────────────
  if (config.mode !== 'cloud') {
    p.intro(pc.red(pc.bold(' Kagura Tests (Local) ')));

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

    // Apply search filter
    if (args.search) {
      const q = args.search.toLowerCase();
      runs = runs.filter(r =>
        r.currentUrl.toLowerCase().includes(q) ||
        r.runId.toLowerCase().includes(q) ||
        r.steps.some(s => s.description.toLowerCase().includes(q))
      );
    }

    const isFiltered = !!(args.status || args.search);
    const total = runs.length;

    // Apply limit
    const limit = args.limit || 20;
    runs = runs.slice(0, limit);

    if (runs.length === 0) {
      p.log.warn(pc.yellow('No local test runs found.'));
      p.outro(pc.gray(`State dir: ${kaguraStateDir()}`));
      return 0;
    }

    console.log('');
    console.log(pc.bold(`  Local Runs (${total} total${isFiltered ? ', filtered' : ''}):`));
    console.log('');

    // Table header
    console.log(`  ${pc.gray('STATUS')}    ${pc.gray('RUN ID')}      ${pc.gray('URL')}                              ${pc.gray('STEPS')}  ${pc.gray('DURATION')}  ${pc.gray('DATE')}`);
    console.log(`  ${pc.gray('─'.repeat(100))}`);

    for (const run of runs) {
      const status = getRunStatus(run);
      const statusIcon = status === 'passed'
        ? pc.green('● pass')
        : status === 'failed'
          ? pc.red('● fail')
          : pc.gray('○ none');

      const id = run.runId.slice(0, 8);
      const url = run.currentUrl.length > 35
        ? run.currentUrl.slice(0, 32) + '...'
        : run.currentUrl;
      const steps = `${run.steps.length}`;
      const duration = formatDuration(getRunDurationMs(run));
      const date = new Date(run.startedAt).toLocaleDateString();

      console.log(`  ${statusIcon}  ${pc.cyan(id)}  ${pc.white(url.padEnd(35))}  ${steps.padStart(3)}    ${pc.gray(duration.padStart(8))}  ${pc.gray(date)}`);
    }

    console.log('');
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
  const apiPath = `/api/v1/tests${queryString ? `?${queryString}` : ''}`;

  const response = await makeApiRequest<ListTestsResponse>('GET', apiPath, apiKey, apiUrl);

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
 * Get details of a single test (local + cloud mode)
 */
export async function getTestCommand(args: { testId: string }): Promise<number> {
  console.log('');

  const config = await loadCliConfig();

  // ── Local mode ──────────────────────────────────────────────────────
  if (config.mode !== 'cloud') {
    p.intro(pc.red(pc.bold(' Kagura Test Details (Local) ')));

    // Try exact match first, then prefix match
    const dir = kaguraStateDir();
    let run: LocalRun | null = null;

    const exactPath = path.join(dir, `${args.testId}.json`);
    try {
      const raw = await fs.readFile(exactPath, 'utf8');
      run = JSON.parse(raw);
    } catch {
      // Try prefix match
      try {
        const files = await fs.readdir(dir);
        const match = files.find(f => f.startsWith(args.testId) && f.endsWith('.json'));
        if (match) {
          const raw = await fs.readFile(path.join(dir, match), 'utf8');
          run = JSON.parse(raw);
        }
      } catch {}
    }

    if (!run) {
      p.log.error(pc.red(`Run not found: ${args.testId}`));
      p.log.message(pc.gray(`Looked in: ${dir}`));
      return 1;
    }

    const status = getRunStatus(run);
    const statusLabel = status === 'passed'
      ? pc.green(pc.bold('PASSED'))
      : status === 'failed'
        ? pc.red(pc.bold('FAILED'))
        : pc.gray('NO STEPS');

    console.log('');
    console.log(`  ${pc.bold('Run ID:')}    ${run.runId}`);
    console.log(`  ${pc.bold('Status:')}    ${statusLabel}`);
    console.log(`  ${pc.bold('URL:')}       ${run.currentUrl}`);
    console.log(`  ${pc.bold('Started:')}   ${new Date(run.startedAt).toLocaleString()}`);
    console.log(`  ${pc.bold('Updated:')}   ${new Date(run.updatedAt).toLocaleString()}`);
    console.log(`  ${pc.bold('Duration:')}  ${formatDuration(getRunDurationMs(run))}`);
    console.log(`  ${pc.bold('Steps:')}     ${run.steps.length}`);

    if (run.steps.length > 0) {
      console.log('');
      console.log(`  ${pc.bold('Steps:')}`);
      console.log(`  ${pc.gray('─'.repeat(80))}`);

      for (const step of run.steps) {
        const icon = step.status === 'success'
          ? pc.green('✓')
          : step.status === 'failed'
            ? pc.red('✗')
            : pc.yellow('○');
        const dur = pc.gray(`${step.durationMs}ms`);
        const action = pc.cyan(step.action);

        console.log(`  ${icon} ${action} ${dur}`);
        console.log(`    ${step.description}`);

        if (step.errorMessage) {
          console.log(`    ${pc.red('Error: ' + step.errorMessage)}`);
        }
        if (step.screenshotUrl) {
          console.log(`    ${pc.gray('Screenshot: ' + step.screenshotUrl)}`);
        }
      }
    }

    if (run.screenshots.length > 0) {
      console.log('');
      console.log(`  ${pc.bold('Screenshots:')} ${run.screenshots.length}`);
      for (const ss of run.screenshots.slice(0, 5)) {
        const label = ss.label ? ` (${ss.label})` : '';
        console.log(`    ${pc.gray('•')} ${ss.url}${pc.gray(label)}`);
      }
      if (run.screenshots.length > 5) {
        console.log(`    ${pc.gray(`... and ${run.screenshots.length - 5} more`)}`);
      }
    }

    console.log('');
    p.outro('');
    return 0;
  }

  // ── Cloud mode ──────────────────────────────────────────────────────
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
