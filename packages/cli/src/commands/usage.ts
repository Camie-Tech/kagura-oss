import https from 'node:https';
import http from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig, resolveApiUrl, resolveApiKey } from '../config/config.js';

interface UsageResponse {
  balance: {
    totalCents: number;
    balanceCents: number;
    freeCreditsCents: number;
    formatted: string;
  };
  currentMonth: {
    period: string;
    runsExecuted: number;
    creditsUsedCents: number;
    creditsUsedFormatted: string;
  };
  tests: {
    total: number;
    published: number;
  };
  runs: {
    totalThisMonth: number;
    completed: number;
    failed: number;
  };
  error?: string;
}

async function makeApiRequest<T>(
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
        method: 'GET',
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
 * Show usage and credit balance (cloud mode only)
 */
export async function usageCommand(): Promise<number> {
  console.log('');

  const config = await loadCliConfig();

  if (config.mode !== 'cloud') {
    p.log.error(pc.red('This command requires cloud mode. Run `kagura mode cloud` first.'));
    p.log.message(pc.gray('In local mode, you use your own API keys and there is no credit system.'));
    return 1;
  }

  const apiUrl = resolveApiUrl(config);
  const apiKey = resolveApiKey(config);

  if (!apiKey) {
    p.log.error(pc.red('No API key configured. Run `kagura setup` first.'));
    return 1;
  }

  p.intro(pc.red(pc.bold(' Kagura Usage ')));

  const s = p.spinner();
  s.start('Fetching usage...');

  const response = await makeApiRequest<UsageResponse>('/api/v1/usage', apiKey, apiUrl);

  s.stop('Done');

  if (!response.ok) {
    p.log.error(pc.red(`Error: ${response.data.error || 'Failed to fetch usage'}`));
    return 1;
  }

  const { balance, currentMonth, tests, runs } = response.data;

  console.log('');
  
  // Balance section
  console.log(pc.bold('  💳 Credit Balance'));
  console.log(`     ${pc.green(pc.bold(balance.formatted))} available`);
  if (balance.freeCreditsCents > 0) {
    console.log(`     ${pc.gray(`(includes $${(balance.freeCreditsCents / 100).toFixed(2)} free credits)`)}`);
  }
  console.log('');

  // Current month section
  console.log(pc.bold(`  📊 This Month (${currentMonth.period})`));
  console.log(`     ${pc.white(String(currentMonth.runsExecuted))} runs executed`);
  console.log(`     ${pc.white(currentMonth.creditsUsedFormatted)} credits used`);
  console.log('');

  // Tests section
  console.log(pc.bold('  🧪 Tests'));
  console.log(`     ${pc.white(String(tests.total))} total tests`);
  console.log(`     ${pc.green(String(tests.published))} published`);
  console.log('');

  // Runs section
  console.log(pc.bold('  🏃 Runs This Month'));
  console.log(`     ${pc.white(String(runs.totalThisMonth))} total`);
  console.log(`     ${pc.green(String(runs.completed))} completed`);
  if (runs.failed > 0) {
    console.log(`     ${pc.red(String(runs.failed))} failed`);
  }
  console.log('');

  p.outro('');
  return 0;
}
