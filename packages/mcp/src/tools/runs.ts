/**
 * Run-related MCP tools
 */

import { KaguraClient } from '../client.js';

export const runTools = [
  {
    name: 'kagura_list_runs',
    description: 'List recent test runs. Can filter by status (queued, running, completed, failed, cancelled).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
          description: 'Filter by run status',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of runs to return (default 20, max 100)',
        },
      },
      required: [],
    },
  },
  {
    name: 'kagura_get_run_status',
    description: 'Get the current status of a test run. Use this to poll for completion after triggering tests.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        runId: {
          type: 'string',
          description: 'The UUID of the run to check',
        },
      },
      required: ['runId'],
    },
  },
  {
    name: 'kagura_get_run_results',
    description: 'Get detailed results of a completed test run, including individual test outcomes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        runId: {
          type: 'string',
          description: 'The UUID of the run to get results for',
        },
      },
      required: ['runId'],
    },
  },
  {
    name: 'kagura_cancel_run',
    description: 'Cancel a running or queued test run.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        runId: {
          type: 'string',
          description: 'The UUID of the run to cancel',
        },
      },
      required: ['runId'],
    },
  },
];

export async function handleRunTool(
  client: KaguraClient,
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'kagura_list_runs': {
      const response = await client.listRuns({
        status: args.status as string | undefined,
        limit: args.limit as number | undefined,
      });

      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to list runs'}` }],
        };
      }

      const { runs, pagination } = response.data;

      if (runs.length === 0) {
        return {
          content: [{ type: 'text', text: 'No runs found.' }],
        };
      }

      const lines = [
        `Found ${pagination.total} runs:`,
        '',
        ...runs.map((r: any) => {
          const progress = r.testsTotal > 0 ? `${r.testsCompleted}/${r.testsTotal}` : '0/0';
          const date = new Date(r.createdAt).toLocaleString();
          return `[${r.status}] ${r.id.slice(0, 8)}... (${progress}) - ${date}`;
        }),
      ];

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }

    case 'kagura_get_run_status': {
      const response = await client.getRunStatus(args.runId as string);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            content: [{ type: 'text', text: 'Run not found.' }],
          };
        }
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to get status'}` }],
        };
      }

      const status = response.data;
      const lines = [
        `Run ID: ${status.runId}`,
        `Status: ${status.status}`,
        `Progress: ${status.progress}/${status.total}`,
        `Passed: ${status.passed}`,
        `Failed: ${status.failed}`,
      ];

      if (status.pausedTests && status.pausedTests.length > 0) {
        lines.push('', 'Paused Tests (waiting for input):');
        for (const pt of status.pausedTests) {
          lines.push(`  - ${pt.testName}: ${pt.question}`);
        }
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }

    case 'kagura_get_run_results': {
      const response = await client.getRunResults(args.runId as string);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            content: [{ type: 'text', text: 'Run not found.' }],
          };
        }
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to get results'}` }],
        };
      }

      const data = response.data;
      const lines = [
        `Run ID: ${data.runId}`,
        `Status: ${data.status}`,
        '',
      ];

      if (data.results && data.results.length > 0) {
        lines.push('Test Results:');
        for (const result of data.results) {
          const icon = result.status === 'passed' ? '✓' : '✗';
          const duration = result.durationMs ? `(${(result.durationMs / 1000).toFixed(1)}s)` : '';
          lines.push(`  ${icon} ${result.testName} ${duration}`);
          if (result.error) {
            lines.push(`    Error: ${result.error}`);
          }
        }
      }

      if (data.summary) {
        lines.push('', `Summary: ${data.summary.passed} passed, ${data.summary.failed} failed of ${data.summary.total} total`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }

    case 'kagura_cancel_run': {
      const response = await client.cancelRun(args.runId as string);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            content: [{ type: 'text', text: 'Run not found.' }],
          };
        }
        return {
          content: [{ type: 'text', text: `Error: ${response.data.error || 'Failed to cancel run'}` }],
        };
      }

      return {
        content: [{ type: 'text', text: `Run ${args.runId} has been cancelled.` }],
      };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      };
  }
}
