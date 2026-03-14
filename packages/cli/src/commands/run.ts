import crypto from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig, resolveApiUrl, resolveApiKey } from '../config/config.js';

// We import the engine for local mode execution
import {
  runAgenticTest,
  type CoreAdapters,
  createSkillRegistry,
  createEmailSkill,
  createEmailCredentialProvider,
} from '@kagura-run/core';
import { createConsoleEventEmitter } from '../adapters/console-events.js';
import { createFsScreenshotStorage } from '../adapters/fs-screenshots.js';
import { createFsStateStorage } from '../adapters/fs-state.js';
import { createFileCredentialProvider } from '../adapters/file-credentials.js';
import { createAnthropicAiProvider } from '../adapters/anthropic-ai.js';

interface CloudRunResponse {
  runId: string;
  status: string;
  testCount: number;
  error?: string;
}

interface CloudStatusResponse {
  runId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total: number;
  passed: number;
  failed: number;
}

interface CloudResultsResponse {
  runId: string;
  status: string;
  results: Array<{
    testId: string;
    testName: string;
    status: string;
    durationMs: number;
    error?: string;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

async function makeApiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  apiKey: string,
  apiUrl: string,
  body?: object
): Promise<{ ok: boolean; data: T; status: number }> {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(path, apiUrl);
      const requestModule = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Kagura-Api-Key': apiKey,
        },
      };

      const req = requestModule.request(urlObj, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ ok: res.statusCode === 200 || res.statusCode === 202, data: parsed, status: res.statusCode || 500 });
          } catch {
            resolve({ ok: false, data: { error: 'Invalid JSON response' } as T, status: res.statusCode || 500 });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, data: { error: err.message } as T, status: 0 });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    } catch (err: any) {
      resolve({ ok: false, data: { error: err.message } as T, status: 0 });
    }
  });
}

async function runCloudMode(args: { url: string; desc: string; prompt?: string }): Promise<number> {
  const config = await loadCliConfig();
  const apiUrl = resolveApiUrl(config);
  const apiKey = resolveApiKey(config);

  if (!apiKey) {
    p.log.error(pc.red('No API key configured. Run `kagura setup` first.'));
    return 1;
  }

  const s = p.spinner();
  s.start('Connecting to Kagura Cloud...');

  // For cloud mode with ad-hoc tests, we need to create a test first
  // Currently the API expects existing test IDs, so we'll create one on-the-fly
  const createTestRes = await makeApiRequest<{ id: string; error?: string }>(
    'POST',
    '/api/tests',
    apiKey,
    apiUrl,
    {
      name: args.desc.slice(0, 100),
      description: args.prompt || args.desc,
      targetUrl: args.url,
      testType: 'one-time',
    }
  );

  if (!createTestRes.ok) {
    s.stop('Failed to create test');
    
    // If the error is about authentication, show helpful message
    if (createTestRes.status === 401) {
      p.log.error(pc.red('Authentication failed. Your API key may be invalid or expired.'));
      p.log.message(pc.gray('Run `kagura setup` to reconfigure your API key.'));
    } else {
      p.log.error(pc.red(`Failed to create test: ${createTestRes.data.error || 'Unknown error'}`));
    }
    return 1;
  }

  const testId = createTestRes.data.id;
  s.message('Test created, triggering execution...');

  // Trigger the test run
  const triggerRes = await makeApiRequest<CloudRunResponse>(
    'POST',
    '/api/v1/tests/trigger',
    apiKey,
    apiUrl,
    {
      testIds: [testId],
      targetUrl: args.url,
    }
  );

  if (!triggerRes.ok) {
    s.stop('Failed to trigger test');
    
    if (triggerRes.data.error?.includes('published')) {
      // Test needs to be published first - for CLI, we auto-publish one-time tests
      p.log.warn(pc.yellow('Test needs to be published. Attempting to publish...'));
      
      const publishRes = await makeApiRequest<{ success: boolean; error?: string }>(
        'POST',
        `/api/tests/${testId}/publish`,
        apiKey,
        apiUrl,
        { action: 'publish' }
      );

      if (!publishRes.ok) {
        p.log.error(pc.red(`Cannot publish test: ${publishRes.data.error}`));
        p.log.message(pc.gray('The test may require human input or need to pass first.'));
        return 1;
      }

      // Retry trigger
      const retryRes = await makeApiRequest<CloudRunResponse>(
        'POST',
        '/api/v1/tests/trigger',
        apiKey,
        apiUrl,
        { testIds: [testId], targetUrl: args.url }
      );

      if (!retryRes.ok) {
        p.log.error(pc.red(`Failed to trigger: ${retryRes.data.error}`));
        return 1;
      }

      s.message(`Run started: ${retryRes.data.runId}`);
    } else {
      p.log.error(pc.red(`Failed to trigger: ${triggerRes.data.error}`));
      return 1;
    }
  }

  const runId = triggerRes.data?.runId;
  if (!runId) {
    s.stop('No run ID returned');
    p.log.error(pc.red('Server did not return a run ID'));
    return 1;
  }

  s.message(`Run ${runId.slice(0, 8)}... in progress`);

  // Poll for status
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max
  let finalStatus: CloudStatusResponse | null = null;

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000)); // Poll every 5 seconds
    
    const statusRes = await makeApiRequest<CloudStatusResponse>(
      'GET',
      `/api/v1/runs/${runId}/status`,
      apiKey,
      apiUrl
    );

    if (!statusRes.ok) {
      attempts++;
      continue;
    }

    finalStatus = statusRes.data;
    
    // Update spinner with progress
    if (finalStatus.total > 0) {
      const pct = Math.round((finalStatus.progress / finalStatus.total) * 100);
      s.message(`Progress: ${finalStatus.progress}/${finalStatus.total} (${pct}%) - ${finalStatus.passed} passed, ${finalStatus.failed} failed`);
    }

    // Check for terminal status
    if (['completed', 'failed', 'cancelled'].includes(finalStatus.status)) {
      break;
    }

    attempts++;
  }

  s.stop('Execution finished');

  if (!finalStatus) {
    p.log.error(pc.red('Failed to get run status'));
    return 1;
  }

  // Get detailed results
  const resultsRes = await makeApiRequest<CloudResultsResponse>(
    'GET',
    `/api/v1/runs/${runId}/results`,
    apiKey,
    apiUrl
  );

  // Display results
  if (finalStatus.status === 'completed' && finalStatus.failed === 0) {
    p.log.success(pc.green(`✓ All tests passed! (${finalStatus.passed}/${finalStatus.total})`));
  } else if (finalStatus.status === 'completed') {
    p.log.warn(pc.yellow(`⚠ ${finalStatus.passed} passed, ${finalStatus.failed} failed`));
  } else if (finalStatus.status === 'failed') {
    p.log.error(pc.red(`✗ Run failed`));
  } else {
    p.log.warn(pc.yellow(`Run ended with status: ${finalStatus.status}`));
  }

  // Show individual test results if available
  if (resultsRes.ok && resultsRes.data.results) {
    console.log('');
    for (const result of resultsRes.data.results) {
      const icon = result.status === 'passed' ? pc.green('✓') : pc.red('✗');
      const duration = result.durationMs ? pc.gray(`(${(result.durationMs / 1000).toFixed(1)}s)`) : '';
      console.log(`  ${icon} ${result.testName} ${duration}`);
      if (result.error) {
        console.log(`    ${pc.red(result.error)}`);
      }
    }
  }

  p.note(
    `${pc.gray('Run ID:')} ${pc.white(runId)}\n${pc.gray('Dashboard:')} ${pc.cyan(apiUrl + '/dashboard')}`,
    'View Details'
  );

  p.outro(finalStatus.failed > 0 ? pc.red('Some tests failed') : pc.green('Done!'));
  
  return finalStatus.failed > 0 ? 1 : 0;
}

export async function runCommand(args: { url: string; desc: string; prompt?: string }): Promise<number> {
  // Don't clear screen — keep command history visible like OpenClaw
  console.log('');
  
  const config = await loadCliConfig();
  
  // TUI Header matching setup style
  p.intro(pc.red(pc.bold(` Kagura Testing [Mode: ${config.mode?.toUpperCase()}] `)));

  p.log.message(`${pc.gray('Target URL:')} ${pc.blue(args.url)}`);
  p.log.message(`${pc.gray('Objective:')}  ${pc.white(args.desc)}`);
  if (args.prompt) {
    p.log.message(`${pc.gray('Prompt:')}     ${pc.cyan('Custom instructions provided')}`);
  }
  p.log.message('');

  // -----------------------------------------------------
  // CLOUD MODE ROUTING
  // -----------------------------------------------------
  if (config.mode === 'cloud') {
    return runCloudMode(args);
  }

  // -----------------------------------------------------
  // LOCAL MODE ROUTING
  // -----------------------------------------------------
  const s = p.spinner();
  s.start('Initializing local AI agent...');
  
  // To avoid breaking the existing Anthropic adapter signature right now, 
  // we ensure the key is passed via the environment just in time for local execution.
  if (config.anthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = config.anthropicApiKey;
  }

  const runId = `run_${crypto.randomUUID()}`;

  // Build skills registry
  let skills = createSkillRegistry();
  let credentialProvider = createFileCredentialProvider();

  // Wire up email skill if configured
  if (config.email?.baseEmail && config.email?.imap) {
    const emailSkill = createEmailSkill({
      baseEmail: config.email.baseEmail,
      imap: config.email.imap,
      smtp: config.email.smtp,
    });
    skills.register(emailSkill);

    // Wrap credential provider: auto-generate via email skill when no saved creds exist
    credentialProvider = createEmailCredentialProvider(
      credentialProvider,
      {
        baseEmail: config.email.baseEmail,
        imap: config.email.imap,
        smtp: config.email.smtp,
      }
    );
  }

  // Interactive user input handler
  const askUser = async (question: string): Promise<string> => {
    s.stop('Agent needs your input');
    
    const response = await p.text({
      message: pc.yellow(question),
      placeholder: 'Type your response...',
    });
    
    if (p.isCancel(response)) {
      return '';
    }
    
    s.start('Continuing test...');
    return response as string;
  };

  const adapters: CoreAdapters = {
    events: createConsoleEventEmitter(),
    screenshots: createFsScreenshotStorage(),
    credentials: credentialProvider,
    state: createFsStateStorage(),
    interaction: {
      askUser,
      isAborted: () => false,
    },
    billing: null,
    ai: createAnthropicAiProvider(),
    skills: skills.listConfigured().length > 0 ? skills : null,
  };

  s.message(`Running tests against ${args.url}...`);

  try {
    // Combine description and prompt for the AI
    // Make it very clear that credentials are provided and should be used directly
    const fullDescription = args.prompt 
      ? `${args.desc}\n\n## Instructions (FOLLOW EXACTLY):\n${args.prompt}\n\nIMPORTANT: If credentials (email, password, etc.) are provided above, use them directly. Do NOT ask the user for credentials that are already specified in the instructions.`
      : args.desc;

    const res = await runAgenticTest({
      adapters,
      runId,
      targetUrl: args.url,
      description: fullDescription,
      config: { 
        maxIterations: args.prompt ? 10 : 1, // More iterations for detailed prompts
        skipCredentialCheck: Boolean(args.prompt), // Skip cred check if prompt has instructions
      },
    });

    s.stop('Execution finished');

    // Post-run formatting
    if (res.status === 'paused') {
      p.log.warn(pc.yellow(`Test paused: ${res.paused?.message}`));
      return 2;
    }

    if (res.status === 'failed') {
      p.log.error(pc.red('Test run failed.'));
      p.outro(pc.red('Review the local trace for failure details.'));
      return 1;
    }

    p.log.success(pc.green('Test completed successfully!'));
    
    // Phase 1.5 Placeholder Hook
    p.note(
      `${pc.gray('Local Trace ID:')} ${pc.white(runId)}\n${pc.gray('Screenshots:')}  ${pc.white('~/.kagura/screenshots/')}`,
      'Results Summary'
    );
    
    p.outro(pc.cyan('Tip: Run ') + pc.bold('kagura ui') + pc.cyan(' to view these traces in the local dashboard (coming soon).'));
    return 0;

  } catch (error: any) {
    s.stop('Execution failed');
    p.log.error(pc.red(`Agent crashed: ${error.message}`));
    return 1;
  }
}
