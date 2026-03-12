import * as p from '@clack/prompts';
import pc from 'picocolors';
import figlet from 'figlet';
import open from 'open';
import { saveCliConfig, loadCliConfig } from '../config/config.js';
import https from 'node:https';
import http from 'node:http';

function maskApiKey(key: string): string {
  if (!key || key.length < 15) return '*'.repeat(key.length);
  // Support both sk-ant- and kag_live_ prefixes
  const prefixLen = key.startsWith('sk-ant-') ? 14 : 9;
  const prefix = key.slice(0, prefixLen);
  const suffix = key.slice(-4);
  const hidden = '*'.repeat(Math.max(4, key.length - prefixLen - 4));
  return `${prefix}${hidden}${suffix}`;
}

async function verifyKaguraKey(apiKey: string, apiUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL('/api/auth/verify-key', apiUrl);
      const requestModule = urlObj.protocol === 'https:' ? https : http;
      
      const req = requestModule.request(urlObj, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.end();
    } catch {
      resolve(false);
    }
  });
}

// Just a basic format check for Anthropic until OAuth is ready
function verifyAnthropicFormat(key: string): boolean {
  return key.startsWith('sk-ant-') && key.length > 40;
}

export async function setupCommand() {
  console.clear();
  
  const logoText = figlet.textSync('KAGURA', { font: 'ANSI Shadow' });
  const version = require('../../package.json').version;
  console.log(`\n${pc.red('⛩')} ${pc.red('Kagura')} ${pc.gray(version)} - ${pc.red('Give me a URL and I\'ll give you peace of mind.')}\n`);
  
  const logoLines = logoText.split('\n');
  const coloredLogo = logoLines.map(line => pc.bgWhite(pc.black(line))).join('\n');
  console.log(coloredLogo);
  console.log(`\n           ${pc.red('⛩')} ${pc.white('KAGURA AI')} ${pc.red('⛩')}\n`);

  p.intro(pc.red(pc.bold(' Kagura onboarding ')));

  const currentConfig = await loadCliConfig();
  const rawApiUrl = process.env.KAGURA_API_URL || currentConfig.apiUrl || 'https://kagura-app.camie.tech';
  const apiUrl = rawApiUrl.replace(/\/$/, '');
  const settingsUrl = `${apiUrl}/settings#api-keys`;

  p.log.message('');
  p.log.step(pc.red(pc.bold('Environment Selection')));
  p.log.message(pc.gray('Choose how you want to run Kagura tests.'));
  p.log.message('');

  const runMode = await p.select({
    message: 'Select your Kagura operating mode:',
    options: [
      { value: 'cloud', label: 'Kagura Cloud (Managed)', hint: 'Requires Kagura account (Recommended)' },
      { value: 'local', label: 'Local OSS (Self-hosted)', hint: 'Requires your own Anthropic API key' }
    ]
  });

  if (p.isCancel(runMode)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // --- LOCAL MODE ---
  if (runMode === 'local') {
    p.log.message('');
    p.log.step(pc.red(pc.bold('Local Environment Setup')));
    p.log.message(pc.gray('Note: In a future update, this will use a secure browser OAuth flow.'));
    
    const antKey = await p.password({
      message: 'Paste your Anthropic API key (sk-ant-...):',
      validate(value) {
        if (!value) return 'API key is required';
        if (!String(value).startsWith('sk-ant-')) return 'Must be a valid Anthropic key (starts with sk-ant-)';
      }
    });

    if (p.isCancel(antKey)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    const keyString = String(antKey).trim();
    const s = p.spinner();
    s.start('Saving local configuration...');

    if (!verifyAnthropicFormat(keyString)) {
      s.stop('Format error');
      p.cancel(pc.red('Invalid Anthropic key format.'));
      process.exit(1);
    }

    await saveCliConfig({ ...currentConfig, mode: 'local', anthropicApiKey: keyString });
    s.stop('Local configuration saved');

    p.note(
      `${pc.gray('Mode:')} ${pc.cyan('Local OSS')}\n${pc.gray('Anthropic Key:')} ${pc.green(maskApiKey(keyString))}\n${pc.gray('Configured:')} ${pc.white('~/.kagura/config.json')}`,
      'Setup Complete'
    );
  } 
  
  // --- CLOUD MODE ---
  else if (runMode === 'cloud') {
    p.log.message('');
    p.log.step(pc.red(pc.bold('Cloud Authentication')));
    
    const openBrowserAction = await p.select({
      message: 'How would you like to get your Kagura API key?',
      options: [
        { value: 'browser', label: 'Open browser automatically', hint: 'recommended' },
        { value: 'manual', label: 'I already have my key' }
      ]
    });

    if (p.isCancel(openBrowserAction)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    if (openBrowserAction === 'browser') {
      const s1 = p.spinner();
      s1.start(`Opening ${settingsUrl}`);
      await open(settingsUrl);
      await new Promise(r => setTimeout(r, 1500));
      s1.stop('Browser opened successfully');
    }

    const apiKey = await p.password({
      message: 'Paste your Kagura API key:',
      validate(value) {
        if (!value) return 'API key is required';
        if (value.length < 10) return 'Invalid API key format';
      }
    });

    if (p.isCancel(apiKey)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    const keyString = String(apiKey).trim();
    const s = p.spinner();
    s.start('Verifying API Key against Kagura Cloud...');
    
    const isValid = await verifyKaguraKey(keyString, apiUrl);
    
    if (!isValid) {
      s.stop('Verification failed');
      p.cancel(pc.red('Error: The API key provided is invalid or the server is unreachable.'));
      process.exit(1);
    }
    
    s.message('Saving configuration locally...');
    await saveCliConfig({ ...currentConfig, mode: 'cloud', apiKey: keyString, apiUrl });
    s.stop('Configuration saved');

    p.note(
      `${pc.gray('Mode:')} ${pc.cyan('Kagura Cloud')}\n${pc.gray('API Key:')} ${pc.green(maskApiKey(keyString))}\n${pc.gray('API URL:')} ${pc.blue(apiUrl)}\n${pc.gray('Configured:')} ${pc.white('~/.kagura/config.json')}`,
      'Setup Complete'
    );
  }

  p.outro(pc.green('You are all set! Run ') + pc.bold(pc.white('kagura run --url <url> --desc "<desc>"')) + pc.green(' to start testing.'));
}
