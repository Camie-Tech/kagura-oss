#!/usr/bin/env node

import { runCommand } from './commands/run.js';
import { setupCommand } from './commands/setup.js';
import { loadCliConfig } from './config/config.js';
import pc from 'picocolors';

function usage() {
  console.log(`kagura (OSS CLI)

Usage:
  kagura setup                                  Initialize the CLI and authenticate
  kagura run --url <targetUrl> --desc "<test description>"

Env:
  ANTHROPIC_API_KEY=...   (required for AI parsing in CLI)
`);
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--desc') args.desc = argv[++i];
    else if (a === '--help' || a === '-h') args.help = '1';
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

  if (cmd === 'run') {
    const config = await loadCliConfig();
    if (!config.apiKey) {
      console.log(pc.red('\nError: Missing Kagura API Key.'));
      console.log(pc.yellow('Please run `kagura setup` first to authenticate your CLI.\n'));
      process.exit(1);
    }

    if (!parsed.url || !parsed.desc) {
      usage();
      process.exit(1);
    }

    const code = await runCommand({ url: parsed.url, desc: parsed.desc });
    process.exit(code);
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
