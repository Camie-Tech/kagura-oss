import crypto from 'node:crypto';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig } from '../config/config.js';

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

export async function runCommand(args: { url: string; desc: string; prompt?: string }): Promise<number> {
  console.clear();
  
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
  // CLOUD MODE ROUTING (Placeholder for Milestone 3)
  // -----------------------------------------------------
  if (config.mode === 'cloud') {
    const s = p.spinner();
    s.start('Connecting to Kagura Cloud...');
    
    // Simulate network delay for now to show the TUI
    await new Promise(r => setTimeout(r, 1500));
    
    s.stop('Connected');
    
    p.log.warn(pc.yellow('Cloud Mode Execution is under construction (Milestone 3).'));
    p.log.message(pc.gray('In the future, this will stream live traces from the Kagura servers.\n'));
    
    p.outro(pc.gray('Run completed (simulated).'));
    return 0;
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

  const adapters: CoreAdapters = {
    events: createConsoleEventEmitter(),
    screenshots: createFsScreenshotStorage(),
    credentials: credentialProvider,
    state: createFsStateStorage(),
    interaction: {
      askUser: async () => '',
      isAborted: () => false,
    },
    billing: null,
    ai: createAnthropicAiProvider(),
    skills: skills.listConfigured().length > 0 ? skills : null,
  };

  s.message(`Running tests against ${args.url}...`);

  try {
    // Combine description and prompt for the AI
    const fullDescription = args.prompt 
      ? `${args.desc}\n\nInstructions:\n${args.prompt}`
      : args.desc;

    const res = await runAgenticTest({
      adapters,
      runId,
      targetUrl: args.url,
      description: fullDescription,
      config: { maxIterations: args.prompt ? 10 : 1 }, // More iterations for detailed prompts
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
