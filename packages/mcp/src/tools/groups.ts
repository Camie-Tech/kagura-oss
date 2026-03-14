/**
 * Test Group-related MCP tools
 */

import { KaguraClient } from '../client.js';

export const groupTools = [
  {
    name: 'kagura_list_test_groups',
    description: 'List all test groups in your Kagura account.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of groups to return (default 50, max 100)',
        },
      },
      required: [],
    },
  },
  {
    name: 'kagura_trigger_test_group',
    description: 'Trigger all published tests in a test group.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        groupId: {
          type: 'string',
          description: 'The UUID of the test group to trigger',
        },
      },
      required: ['groupId'],
    },
  },
];

export async function handleGroupTool(
  client: KaguraClient,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'kagura_list_test_groups': {
      const response = await client.listTestGroups({
        limit: args.limit as number | undefined,
      });

      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to list test groups'}` }],
        };
      }

      const { groups, pagination } = response.data;

      if (groups.length === 0) {
        return {
          content: [{ type: 'text', text: 'No test groups found.' }],
        };
      }

      const lines = [
        `Found ${pagination.total} test groups:`,
        '',
        ...groups.map((g: any) => {
          return `${g.name} (${g.id}) - ${g.publishedCount}/${g.testCount} published`;
        }),
      ];

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }

    case 'kagura_trigger_test_group': {
      const response = await client.triggerTestGroup(args.groupId as string);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            content: [{ type: 'text', text: 'Test group not found.' }],
          };
        }
        if (response.data.code === 'NO_PUBLISHED_TESTS') {
          return {
            content: [{ type: 'text', text: 'No published tests in this group.' }],
          };
        }
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to trigger group'}` }],
        };
      }

      const { runId, groupName, testsQueued } = response.data;

      return {
        content: [{
          type: 'text',
          text: [
            `Triggered group "${groupName}"`,
            `Tests queued: ${testsQueued}`,
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
