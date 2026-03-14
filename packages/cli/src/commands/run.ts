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
  testId: string;
  resultId: string;
  status: string;
  passed: boolean;
  summary?: string;
  error?: string;
  steps?: any[];
  pollUrl?: string;
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

  // Use the ad-hoc test run endpoint
  const response = await makeApiRequest<CloudRunResponse>(
    'POST',
    '/api/v1/tests/run',
    apiKey,
    apiUrl,
    {
      url: args.url,
      desc: args.desc,
      prompt: args.prompt,
      wait: true, // Wait for result
    }
  );

  if (!response.ok) {
    s.stop('Request failed');
    
    if (response.status === 401) {
      p.log.error(pc.red('Authentication failed. Your API key may be invalid or expired.'));
      p.log.message(pc.gray('Run `kagura setup` to reconfigure your API key.'));
    } else if (response.status === 402) {
      p.log.error(pc.red('Insufficient credits. Please add credits to your account.'));
    } else {
      p.log.error(pc.red(`Failed: ${response.data.error || 'Unknown error'}`));
    }
    return 1;
  }

  s.stop('Test completed');

  const result = response.data;

  // Display results
  if (result.passed) {
    p.log.success(pc.green('✓ Test passed!'));
  } else {
    p.log.error(pc.red(`✗ Test failed: ${result.status}`));
  }

  // Show summary if available
  if (result.summary) {
    console.log('');
    p.note(result.summary, 'AI Summary');
  }

  // Show error if any
  if (result.error) {
    console.log('');
    p.log.error(pc.red(result.error));
  }

  // Show steps count
  if (result.steps && result.steps.length > 0) {
    console.log('');
    p.log.message(pc.gray(`Executed ${result.steps.length} steps`));
  }

  p.note(
    `${pc.gray('Test ID:')} ${pc.white(result.testId)}\n${pc.gray('Result ID:')} ${pc.white(result.resultId)}\n${pc.gray('Dashboard:')} ${pc.cyan(apiUrl + '/tests/' + result.testId)}`,
    'View Details'
  );

  p.outro(result.passed ? pc.green('Done!') : pc.red('Test failed'));
  
  return result.passed ? 0 : 1;
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
