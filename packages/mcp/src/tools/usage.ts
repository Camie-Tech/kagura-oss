/**
 * Usage/billing MCP tools
 */

import { KaguraClient } from '../client.js';

export const usageTools = [
  {
    name: 'kagura_get_usage',
    description: 'Get your current credit balance and usage statistics for Kagura Cloud.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

export async function handleUsageTool(
  client: KaguraClient,
  name: string,
  _args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'kagura_get_usage': {
      const response = await client.getUsage();

      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to get usage'}` }],
        };
      }

      const { balance, currentMonth, tests, runs } = response.data;

      const lines = [
        '**Credit Balance**',
        `  Available: ${balance.formatted}`,
        '',
        `**This Month (${currentMonth.period})**`,
        `  Runs executed: ${currentMonth.runsExecuted}`,
        `  Credits used: ${currentMonth.creditsUsedFormatted}`,
        '',
        '**Tests**',
        `  Total: ${tests.total}`,
        `  Published: ${tests.published}`,
        '',
        '**Runs This Month**',
        `  Total: ${runs.totalThisMonth}`,
        `  Completed: ${runs.completed}`,
        `  Failed: ${runs.failed}`,
      ];

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      };
  }
}
