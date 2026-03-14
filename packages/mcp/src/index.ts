#!/usr/bin/env node

/**
 * Kagura MCP Server
 * 
 * Model Context Protocol server for Kagura AI Cloud.
 * Exposes Kagura's Public API v1 as MCP tools for AI agents.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { KaguraClient } from './client.js';
import { testTools, handleTestTool } from './tools/tests.js';
import { runTools, handleRunTool } from './tools/runs.js';
import { groupTools, handleGroupTool } from './tools/groups.js';
import { usageTools, handleUsageTool } from './tools/usage.js';

// Get API key from environment
const apiKey = process.env.KAGURA_API_KEY;
const baseUrl = process.env.KAGURA_API_URL || 'https://app.kagura.run';

if (!apiKey) {
  console.error('Error: KAGURA_API_KEY environment variable is required.');
  console.error('');
  console.error('Set it in your MCP configuration:');
  console.error('');
  console.error('  {');
  console.error('    "mcpServers": {');
  console.error('      "kagura": {');
  console.error('        "command": "npx",');
  console.error('        "args": ["@kagura/mcp"],');
  console.error('        "env": {');
  console.error('          "KAGURA_API_KEY": "kag_live_your_api_key_here"');
  console.error('        }');
  console.error('      }');
  console.error('    }');
  console.error('  }');
  console.error('');
  console.error('Get your API key at: https://app.kagura.run/settings/api-keys');
  process.exit(1);
}

// Initialize client
const client = new KaguraClient({ apiKey, baseUrl });

// Combine all tools
const allTools = [...testTools, ...runTools, ...groupTools, ...usageTools];

// Create MCP server
const server = new Server(
  {
    name: 'kagura',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  // Route to appropriate handler
  if (name.startsWith('kagura_list_tests') || name.startsWith('kagura_get_test') || name.startsWith('kagura_trigger_tests')) {
    return handleTestTool(client, name, args as Record<string, unknown>);
  }

  if (name.startsWith('kagura_list_runs') || name.startsWith('kagura_get_run') || name.startsWith('kagura_cancel_run')) {
    return handleRunTool(client, name, args as Record<string, unknown>);
  }

  if (name.startsWith('kagura_list_test_groups') || name.startsWith('kagura_trigger_test_group')) {
    return handleGroupTool(client, name, args as Record<string, unknown>);
  }

  if (name.startsWith('kagura_get_usage')) {
    return handleUsageTool(client, name, args as Record<string, unknown>);
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Kagura MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
