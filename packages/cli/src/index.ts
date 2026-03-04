#!/usr/bin/env node

import { runCommand } from './commands/run.js'

function usage() {
  // eslint-disable-next-line no-console
  console.log(`kagura (OSS CLI)

Usage:
  kagura run --url <targetUrl> --desc "<test description>"

Env:
  ANTHROPIC_API_KEY=...   (required for AI parsing in CLI)

Credentials file (optional):
  ~/.kagura/credentials.json
  {
    "https://example.com": { "email": "test@example.com", "password": "..." }
  }
`)
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url') args.url = argv[++i]
    else if (a === '--desc') args.desc = argv[++i]
    else if (a === '--help' || a === '-h') args.help = '1'
  }
  return args
}

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0]
  const parsed = parseArgs(argv.slice(1))

  if (!cmd || parsed.help) {
    usage()
    process.exit(0)
  }

  if (cmd === 'run') {
    if (!parsed.url || !parsed.desc) {
      usage()
      process.exit(1)
    }

    const code = await runCommand({ url: parsed.url, desc: parsed.desc })
    process.exit(code)
  }

  usage()
  process.exit(1)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
