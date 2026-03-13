import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadCliConfig, saveCliConfig } from '../config/config.js';

export async function modeCommand(args: { mode?: string }) {
  const config = await loadCliConfig();

  // If no argument, show current mode
  if (!args.mode) {
    if (!config.mode) {
      console.log(pc.yellow('\nNo mode configured. Run `kagura setup` first.\n'));
      return;
    }

    console.log('');
    console.log(pc.bold('Current Mode:'), config.mode === 'cloud' 
      ? pc.cyan('☁️  Kagura Cloud') 
      : pc.green('🖥️  Local OSS'));
    
    if (config.mode === 'cloud' && config.apiKey) {
      console.log(pc.gray('API Key:'), maskKey(config.apiKey, 'kag_live_'));
    }
    if (config.mode === 'local' && config.anthropicApiKey) {
      console.log(pc.gray('Anthropic Key:'), maskKey(config.anthropicApiKey, 'sk-ant-'));
    }
    console.log('');
    console.log(pc.gray('Switch modes: kagura mode local | kagura mode cloud'));
    console.log('');
    return;
  }

  // Switch mode
  const newMode = args.mode.toLowerCase();
  
  if (newMode !== 'local' && newMode !== 'cloud') {
    console.log(pc.red(`\nInvalid mode: "${args.mode}"`));
    console.log(pc.gray('Valid modes: local, cloud\n'));
    return;
  }

  // Check if key exists for the target mode
  if (newMode === 'cloud' && !config.apiKey) {
    console.log(pc.yellow('\nNo Kagura API key saved.'));
    console.log(pc.gray('Run `kagura setup` and select Cloud mode to add your key.\n'));
    return;
  }

  if (newMode === 'local' && !config.anthropicApiKey) {
    console.log(pc.yellow('\nNo Anthropic API key saved.'));
    console.log(pc.gray('Run `kagura setup` and select Local mode to add your key.\n'));
    return;
  }

  // Switch
  await saveCliConfig({ ...config, mode: newMode });

  console.log('');
  console.log(pc.green('✓'), 'Switched to', newMode === 'cloud' 
    ? pc.cyan('☁️  Kagura Cloud') 
    : pc.green('🖥️  Local OSS'));
  console.log('');
}

function maskKey(key: string, prefix: string): string {
  if (!key || key.length < 15) return '****';
  const suffix = key.slice(-2);
  return `${prefix}****${suffix}`;
}
