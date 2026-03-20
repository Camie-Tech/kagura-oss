import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig } from '../config/config.js';
import { kaguraStateDir } from '../config/paths.js';
import { loadLocalRuns, getRunStatus, getRunDurationMs, formatDuration } from './tests.js';

/**
 * Show local testing statistics
 */
export async function statsCommand(): Promise<number> {
  console.log('');

  const config = await loadCliConfig();

  if (config.mode === 'cloud') {
    p.log.error(pc.red('Stats command is only available in local mode.'));
    p.log.message(pc.gray('Switch to local mode: kagura mode local'));
    return 1;
  }

  p.intro(pc.red(pc.bold(' Kagura Stats ')));

  const s = p.spinner();
  s.start('Analyzing local runs...');

  const runs = await loadLocalRuns();

  s.stop('Done');

  if (runs.length === 0) {
    p.log.warn(pc.yellow('No local test runs found.'));
    p.outro(pc.gray(`State dir: ${kaguraStateDir()}`));
    return 0;
  }

  // ── Compute stats ──────────────────────────────────────────────────

  const total = runs.length;
  const passed = runs.filter(r => getRunStatus(r) === 'passed').length;
  const failed = runs.filter(r => getRunStatus(r) === 'failed').length;
  const noSteps = runs.filter(r => getRunStatus(r) === 'no-steps').length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

  const durations = runs.map(r => getRunDurationMs(r));
  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  const totalSteps = runs.reduce((sum, r) => sum + r.steps.length, 0);
  const failedSteps = runs.reduce((sum, r) => sum + r.steps.filter(s => s.status === 'failed').length, 0);

  // URL frequency
  const urlCounts = new Map<string, number>();
  for (const run of runs) {
    const url = run.currentUrl;
    urlCounts.set(url, (urlCounts.get(url) || 0) + 1);
  }
  const topUrls = [...urlCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const lastRun = runs[0]; // already sorted newest-first
  const firstRun = runs[runs.length - 1];

  // ── Display ────────────────────────────────────────────────────────

  console.log('');
  console.log(`  ${pc.bold('Overview')}`);
  console.log(`  ${pc.gray('─'.repeat(50))}`);
  console.log(`  Total runs:       ${pc.bold(String(total))}`);
  console.log(`  Passed:           ${pc.green(pc.bold(String(passed)))}`);
  console.log(`  Failed:           ${failed > 0 ? pc.red(pc.bold(String(failed))) : pc.gray('0')}`);
  if (noSteps > 0) {
    console.log(`  No steps:         ${pc.gray(String(noSteps))}`);
  }
  console.log(`  Pass rate:        ${parseFloat(passRate) >= 80 ? pc.green(passRate + '%') : parseFloat(passRate) >= 50 ? pc.yellow(passRate + '%') : pc.red(passRate + '%')}`);
  console.log('');
  console.log(`  ${pc.bold('Performance')}`);
  console.log(`  ${pc.gray('─'.repeat(50))}`);
  console.log(`  Avg duration:     ${pc.cyan(formatDuration(Math.round(avgDuration)))}`);
  console.log(`  Total steps:      ${String(totalSteps)}`);
  console.log(`  Failed steps:     ${failedSteps > 0 ? pc.red(String(failedSteps)) : pc.gray('0')}`);

  console.log('');
  console.log(`  ${pc.bold('Timeline')}`);
  console.log(`  ${pc.gray('─'.repeat(50))}`);
  console.log(`  First run:        ${pc.gray(new Date(firstRun.startedAt).toLocaleString())}`);
  console.log(`  Last run:         ${pc.gray(new Date(lastRun.startedAt).toLocaleString())}`);

  if (topUrls.length > 0) {
    console.log('');
    console.log(`  ${pc.bold('Most Tested URLs')}`);
    console.log(`  ${pc.gray('─'.repeat(50))}`);
    for (const [url, count] of topUrls) {
      const bar = pc.green('█'.repeat(Math.min(Math.ceil((count / total) * 20), 20)));
      console.log(`  ${bar} ${pc.bold(String(count))} ${pc.gray(url)}`);
    }
  }

  console.log('');
  p.outro(pc.gray(`State dir: ${kaguraStateDir()}`));
  return 0;
}
