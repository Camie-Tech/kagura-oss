/**
 * Test-related MCP tools
 */

import { KaguraClient } from '../client.js';

export const testTools = [
  {
    name: 'kagura_list_tests',
    description: 'List all tests in your Kagura account. Can filter by published status, passing status, or search by name.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        published: {
          type: 'boolean',
          description: 'Filter to only published tests (true) or draft tests (false)',
        },
        passing: {
          type: 'boolean',
          description: 'Filter to only passing tests (true) or failing tests (false)',
        },
        search: {
          type: 'string',
          description: 'Search tests by name or description',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tests to return (default 50, max 100)',
        },
      },
      required: [],
    },
  },
  {
    name: 'kagura_get_test',
    description: 'Get detailed information about a specific test, including recent run history.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        testId: {
          type: 'string',
          description: 'The UUID of the test to retrieve',
        },
      },
      required: ['testId'],
    },
  },
  {
    name: 'kagura_trigger_tests',
    description: 'Trigger one or more published tests to run. Returns a run ID that can be used to check status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        testIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of test UUIDs to trigger',
        },
      },
      required: ['testIds'],
    },
  },
];

export async function handleTestTool(
  client: KaguraClient,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'kagura_list_tests': {
      const response = await client.listTests({
        published: args.published as boolean | undefined,
        passing: args.passing as boolean | undefined,
        search: args.search as string | undefined,
        limit: args.limit as number | undefined,
      });

      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to list tests'}` }],
        };
      }

      const { tests, pagination } = response.data;
      
      if (tests.length === 0) {
        return {
          content: [{ type: 'text', text: 'No tests found.' }],
        };
      }

      const lines = [
        `Found ${pagination.total} tests:`,
        '',
        ...tests.map((t: any) => {
          const status = t.lastRunStatus === 'passed' ? '✓' : t.lastRunStatus === 'failed' ? '✗' : '○';
          const published = t.isPublished ? '[published]' : '[draft]';
          return `${status} ${t.name} (${t.id}) ${published}`;
        }),
      ];

      if (pagination.hasMore) {
        lines.push('', `Showing ${tests.length} of ${pagination.total}. Use limit parameter to see more.`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }

    case 'kagura_get_test': {
      const response = await client.getTest(args.testId as string);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            content: [{ type: 'text', text: 'Test not found.' }],
          };
        }
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to get test'}` }],
        };
      }

      const test = response.data;
      const lines = [
        `**${test.name}**`,
        `ID: ${test.id}`,
        `URL: ${test.targetUrl}`,
        `Published: ${test.isPublished ? 'Yes' : 'No'}`,
        `Requires Input: ${test.requiresHumanInput ? 'Yes' : 'No'}`,
      ];

      if (test.description) {
        lines.push(`Description: ${test.description}`);
      }

      if (test.authProfile) {
        lines.push(`Auth Profile: ${test.authProfile.name} (${test.authProfile.authType})`);
      }

      if (test.recentRuns && test.recentRuns.length > 0) {
        lines.push('', 'Recent Runs:');
        for (const run of test.recentRuns.slice(0, 5)) {
          const icon = run.status === 'passed' ? '✓' : '✗';
          lines.push(`  ${icon} ${run.status} - ${new Date(run.createdAt).toLocaleDateString()}`);
        }
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }

    case 'kagura_trigger_tests': {
      const testIds = args.testIds as string[];
      
      if (!testIds || testIds.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: At least one test ID is required.' }],
        };
      }

      const response = await client.triggerTests(testIds);

      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to trigger tests'}` }],
        };
      }

      const { runId, testsQueued } = response.data;
      
      return {
        content: [{
          type: 'text',
          text: [
            `Triggered ${testsQueued} test(s)`,
            `Run ID: ${runId}`,
            '',
            'Use kagura_get_run_status to check progress.',
          ].join('\n'),
        }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      };
  }
}
