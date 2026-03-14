# @kagura-run/mcp

MCP (Model Context Protocol) server for [Kagura AI Cloud](https://kagura.run) — Agentic Testing.

This package allows AI agents (Claude in Cursor, VS Code, etc.) to interact with your Kagura tests directly.

## Installation

### Cursor

Add to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "kagura": {
      "command": "npx",
      "args": ["@kagura-run/mcp"],
      "env": {
        "KAGURA_API_KEY": "kag_live_your_api_key_here"
      }
    }
  }
}
```

### VS Code

Add to your VS Code MCP settings:

```json
{
  "mcp.servers": {
    "kagura": {
      "command": "npx",
      "args": ["@kagura-run/mcp"],
      "env": {
        "KAGURA_API_KEY": "kag_live_your_api_key_here"
      }
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kagura": {
      "command": "npx",
      "args": ["@kagura-run/mcp"],
      "env": {
        "KAGURA_API_KEY": "kag_live_your_api_key_here"
      }
    }
  }
}
```

## Getting Your API Key

1. Sign in to [Kagura Cloud](https://app.kagura.run)
2. Go to Settings → API Keys
3. Create a new API key
4. Copy the key (starts with `kag_live_`)

## Available Tools

### Tests

| Tool | Description |
|------|-------------|
| `kagura_list_tests` | List all tests (filter by published, passing, search) |
| `kagura_get_test` | Get detailed info about a specific test |
| `kagura_trigger_tests` | Trigger one or more published tests |

### Runs

| Tool | Description |
|------|-------------|
| `kagura_list_runs` | List recent test runs (filter by status) |
| `kagura_get_run_status` | Check the status of a run |
| `kagura_get_run_results` | Get detailed results of a completed run |
| `kagura_cancel_run` | Cancel a running or queued run |

### Test Groups

| Tool | Description |
|------|-------------|
| `kagura_list_test_groups` | List all test groups |
| `kagura_trigger_test_group` | Trigger all tests in a group |

### Usage

| Tool | Description |
|------|-------------|
| `kagura_get_usage` | Get credit balance and usage stats |

## Example Usage

Once configured, you can ask your AI agent things like:

- "List my published Kagura tests"
- "Run the login test"
- "Check the status of my last test run"
- "Show me my Kagura usage this month"
- "Trigger all tests in my regression group"

## Configuration Options

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `KAGURA_API_KEY` | Your Kagura API key (required) | - |
| `KAGURA_API_URL` | Custom API URL (for self-hosted) | `https://app.kagura.run` |

## Requirements

- Node.js 18 or later
- A Kagura Cloud account with API access

## Links

- [Kagura Cloud](https://kagura.run)
- [Documentation](https://docs.kagura.run)
- [GitHub](https://github.com/Camie-Tech/kagura-oss)

## License

MIT
