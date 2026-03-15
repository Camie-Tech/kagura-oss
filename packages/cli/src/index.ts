#!/usr/bin/env node

import { runCommand } from './commands/run.js';
import { setupCommand } from './commands/setup.js';
import { uiCommand } from './commands/ui.js';
import { modeCommand } from './commands/mode.js';
import { triggerCommand, statusCommand, resultsCommand } from './commands/trigger.js';
import { listTestsCommand, getTestCommand } from './commands/tests.js';
import { listRunsCommand, cancelRunCommand } from './commands/runs.js';
import { listGroupsCommand, triggerGroupCommand } from './commands/groups.js';
import { usageCommand } from './commands/usage.js';
import { loadCliConfig } from './config/config.js';
import pc from 'picocolors';

function usage() {
  console.log(`${pc.red(pc.bold('kagura'))} - Agentic Testing CLI

${pc.bold('Usage:')}
  kagura <command> [options]

${pc.bold('Setup & Config:')}
  kagura setup                                    Initialize the CLI and authenticate
  kagura mode                                     Show current mode (local/cloud)
  kagura mode <local|cloud>                       Switch between local and cloud mode
  kagura ui                                       Launch the local visualization dashboard

${pc.bold('Ad-hoc Testing (Local & Cloud):')}
  kagura run --url <url> --desc "<desc>"          Run ad-hoc test
    --prompt "<instructions>"                     Optional detailed instructions

${pc.bold('Tests (Cloud Mode):')}
  kagura tests                                    List all tests
    --published                                   Filter: only published tests
    --passing                                     Filter: only passing tests
    --search "<query>"                            Search by name/description
    --limit <n>                                   Number of results (default 50)
  kagura tests get --test-id <uuid>               Get test details

${pc.bold('Test Groups (Cloud Mode):')}
  kagura groups                                   List all test groups
    --limit <n>                                   Number of results
  kagura groups trigger --group-id <uuid>         Trigger all tests in a group

${pc.bold('Trigger & Run (Cloud Mode):')}
  kagura trigger --test-id <uuid>                 Trigger a published test
  kagura trigger --test-id <id1>,<id2>            Trigger multiple tests
  kagura trigger --group-id <uuid>                Trigger a test group
    --no-wait                                     Don't wait for completion

${pc.bold('Run Status (Cloud Mode):')}
  kagura runs                                     List recent runs
    --status <status>                             Filter by status
    --limit <n>                                   Number of results
  kagura status --run-id <uuid>                   Check run status
  kagura results --run-id <uuid>                  Get detailed results
  kagura cancel --run-id <uuid>                   Cancel a running test

${pc.bold('Usage & Billing (Cloud Mode):')}
  kagura usage                                    Show credit balance and stats

${pc.bold('Options:')}
  --help, -h                                      Show this help
`);
}

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean | string[]> = {};
  const testIds: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--desc') args.desc = argv[++i];
    else if (a === '--prompt') args.prompt = argv[++i];
    else if (a === '--test-id' || a === '--test-ids') {
      const val = argv[++i];
      if (val) {
        testIds.push(...val.split(',').map(id => id.trim()).filter(Boolean));
      }
    }
    else if (a === '--group-id') args.groupId = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--no-wait') args.noWait = true;
    else if (a === '--published') args.published = true;
    else if (a === '--passing') args.passing = true;
    else if (a === '--search') args.search = argv[++i];
    else if (a === '--status') args.status = argv[++i];
    else if (a === '--limit') args.limit = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--version' || a === '-v' || a === '-V') args.version = true;
  }

  if (testIds.length > 0) {
    args.testIds = testIds;
  }

  return args;
}

const VERSION = '0.3.4';

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const subCmd = argv[1];
  const parsed = parseArgs(argv.slice(1));

  // Handle --version, -v, -V
  if (cmd === '--version' || cmd === '-v' || cmd === '-V' || parsed.version) {
    console.log(VERSION);
    process.exit(0);
  }

  // Handle --help, -h, or no command
  if (!cmd || cmd === '--help' || cmd === '-h' || parsed.help) {
    usage();
    process.exit(0);
  }

  // Setup & Config commands
  if (cmd === 'setup') {
    await setupCommand();
    return;
  }

  if (cmd === 'ui') {
    await uiCommand();
    return;
  }

  if (cmd === 'mode') {
    const newMode = argv[1];
    await modeCommand({ mode: newMode as 'local' | 'cloud' | undefined });
    process.exit(0);
  }

  // Tests commands
  if (cmd === 'tests') {
    if (subCmd === 'get') {
      if (!parsed.testId && !parsed.testIds) {
        console.error(pc.red('Error: --test-id is required'));
        console.log('Usage: kagura tests get --test-id <uuid>');
        process.exit(1);
      }
      const testId = parsed.testId as string || (parsed.testIds as string[])?.[0];
      const code = await getTestCommand({ testId });
      process.exit(code);
    }
    
    // List tests
    const code = await listTestsCommand({
      published: parsed.published as boolean | undefined,
      passing: parsed.passing as boolean | undefined,
      limit: parsed.limit ? parseInt(parsed.limit as string) : undefined,
      search: parsed.search as string | undefined,
    });
    process.exit(code);
  }

  // Test Groups commands
  if (cmd === 'groups') {
    if (subCmd === 'trigger') {
      if (!parsed.groupId) {
        console.error(pc.red('Error: --group-id is required'));
        console.log('Usage: kagura groups trigger --group-id <uuid>');
        process.exit(1);
      }
      const code = await triggerGroupCommand({
        groupId: parsed.groupId as string,
        wait: !parsed.noWait,
      });
      process.exit(code);
    }

    // List groups
    const code = await listGroupsCommand({
      limit: parsed.limit ? parseInt(parsed.limit as string) : undefined,
    });
    process.exit(code);
  }

  // Runs commands
  if (cmd === 'runs') {
    const code = await listRunsCommand({
      status: parsed.status as string | undefined,
      limit: parsed.limit ? parseInt(parsed.limit as string) : undefined,
    });
    process.exit(code);
  }

  // Trigger command
  if (cmd === 'trigger') {
    if (!parsed.testIds && !parsed.groupId) {
      console.error(pc.red('Error: --test-id or --group-id is required'));
      console.log('Usage: kagura trigger --test-id <uuid>');
      console.log('       kagura trigger --test-id <uuid1>,<uuid2>,<uuid3>');
      console.log('       kagura trigger --group-id <uuid>');
      process.exit(1);
    }
    const code = await triggerCommand({
      testIds: parsed.testIds as string[] | undefined,
      groupId: parsed.groupId as string | undefined,
      wait: !parsed.noWait,
    });
    process.exit(code);
  }

  // Status command
  if (cmd === 'status') {
    if (!parsed.runId) {
      console.error(pc.red('Error: --run-id is required'));
      console.log('Usage: kagura status --run-id <uuid>');
      process.exit(1);
    }
    const code = await statusCommand({ runId: parsed.runId as string });
    process.exit(code);
  }

  // Results command
  if (cmd === 'results') {
    if (!parsed.runId) {
      console.error(pc.red('Error: --run-id is required'));
      console.log('Usage: kagura results --run-id <uuid>');
      process.exit(1);
    }
    const code = await resultsCommand({ runId: parsed.runId as string });
    process.exit(code);
  }

  // Cancel command
  if (cmd === 'cancel') {
    if (!parsed.runId) {
      console.error(pc.red('Error: --run-id is required'));
      console.log('Usage: kagura cancel --run-id <uuid>');
      process.exit(1);
    }
    const code = await cancelRunCommand({ runId: parsed.runId as string });
    process.exit(code);
  }

  // Usage command
  if (cmd === 'usage') {
    const code = await usageCommand();
    process.exit(code);
  }

  // Run command (ad-hoc testing)
  if (cmd === 'run') {
    if (!parsed.url || !parsed.desc) {
      console.error(pc.red('Error: --url and --desc are required'));
      console.log('Usage: kagura run --url <targetUrl> --desc "<description>"');
      process.exit(1);
    }
    const code = await runCommand({
      url: parsed.url as string,
      desc: parsed.desc as string,
      prompt: parsed.prompt as string | undefined,
    });
    process.exit(code);
  }

  console.error(pc.red(`Unknown command: ${cmd}`));
  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(pc.red('Fatal error:'), err.message);
  process.exit(1);
});
