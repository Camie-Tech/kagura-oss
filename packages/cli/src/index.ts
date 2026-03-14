#!/usr/bin/env node

import { runCommand } from './commands/run.js';
import { setupCommand } from './commands/setup.js';
import { uiCommand } from './commands/ui.js';
import { modeCommand } from './commands/mode.js';
import { triggerCommand, statusCommand, resultsCommand } from './commands/trigger.js';
import { loadCliConfig } from './config/config.js';
import pc from 'picocolors';

function usage() {
  console.log(`kagura (OSS CLI)

Usage:
  kagura setup                                  Initialize the CLI and authenticate
  kagura mode                                   Show current mode (local/cloud)
  kagura mode <local|cloud>                     Switch between local and cloud mode
  kagura ui                                     Launch the local visualization dashboard

  ${pc.bold('Ad-hoc Testing:')}
  kagura run --url <targetUrl> --desc "<description>" [--prompt "<instructions>"]

  ${pc.bold('CI/CD (Cloud Mode - Published Tests):')}
  kagura trigger --test-id <uuid>                     Trigger a single published test
  kagura trigger --test-id <id1>,<id2>,<id3>          Trigger multiple tests (comma-separated)
  kagura trigger --test-id <id1> --test-id <id2>      Trigger multiple tests (multiple flags)
  kagura trigger --group-id <uuid>                    Trigger a test group
  kagura trigger --test-id <uuid> --no-wait           Trigger without waiting for completion
  kagura status --run-id <uuid>                       Check status of a run
  kagura results --run-id <uuid>                      Get detailed results of a run

Options:
  --url        Target URL to test (for run command)
  --desc       Short description of the test (for run command)
  --prompt     Detailed step-by-step instructions (for run command)
  --test-id    UUID of a published test (for trigger command)
  --group-id   UUID of a test group (for trigger command)
  --run-id     UUID of a run (for status/results commands)
  --no-wait    Don't wait for completion (for trigger command)
  --help, -h   Show this help
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
      // Support multiple --test-id flags or comma-separated values
      const val = argv[++i];
      if (val) {
        testIds.push(...val.split(',').map(id => id.trim()).filter(Boolean));
      }
    }
    else if (a === '--group-id') args.groupId = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--no-wait') args.noWait = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  
  if (testIds.length > 0) {
    args.testIds = testIds;
  }
  
  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const parsed = parseArgs(argv.slice(1));

  if (!cmd || parsed.help) {
    usage();
    process.exit(0);
  }

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
    const code = await modeCommand(newMode as 'local' | 'cloud' | undefined);
    process.exit(code);
  }

  if (cmd === 'trigger') {
    if (!parsed.testIds && !parsed.groupId) {
      console.error(pc.red('Error: --test-id or --group-id is required'));
      console.log('Usage: kagura trigger --test-id <uuid>');
      console.log('       kagura trigger --test-id <uuid1>,<uuid2>,<uuid3>');
      console.log('       kagura trigger --test-id <uuid1> --test-id <uuid2>');
      process.exit(1);
    }
    const code = await triggerCommand({
      testIds: parsed.testIds as string[] | undefined,
      groupId: parsed.groupId as string | undefined,
      wait: !parsed.noWait,
    });
    process.exit(code);
  }

  if (cmd === 'status') {
    if (!parsed.runId) {
      console.error(pc.red('Error: --run-id is required'));
      console.log('Usage: kagura status --run-id <uuid>');
      process.exit(1);
    }
    const code = await statusCommand({ runId: parsed.runId as string });
    process.exit(code);
  }

  if (cmd === 'results') {
    if (!parsed.runId) {
      console.error(pc.red('Error: --run-id is required'));
      console.log('Usage: kagura results --run-id <uuid>');
      process.exit(1);
    }
    const code = await resultsCommand({ runId: parsed.runId as string });
    process.exit(code);
  }

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
