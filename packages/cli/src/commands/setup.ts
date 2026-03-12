import * as p from '@clack/prompts';
import pc from 'picocolors';
import figlet from 'figlet';
import open from 'open';
import { saveCliConfig, loadCliConfig } from '../config/config.js';
import https from 'node:https';
import http from 'node:http';

function maskApiKey(key: string): string {
  if (!key || key.length < 15) return '*'.repeat(key.length);
  const prefix = key.slice(0, 9);
  const suffix = key.slice(-2);
  const hidden = '*'.repeat(key.length - 11);
  return `${prefix}${hidden}${suffix}`;
}

async function verifyApiKey(apiKey: string, apiUrl: string): Promise<boolean> {
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

export async function setupCommand() {
  console.clear();
  
  // Render ASCII Art Logo - using 'ANSI Shadow' font for the blocky look like OpenClaw
  const logoText = figlet.textSync('KAGURA', { font: 'ANSI Shadow' });
  
  // Create the OpenClaw-style header
  const version = require('../../package.json').version;
  console.log(`\n${pc.red('⛩')} ${pc.red('Kagura')} ${pc.gray(version)} - ${pc.red('Give me a URL and I\'ll give you peace of mind.')}\n`);
  
  // The blocky white/gray logo matching OpenClaw's style
  const logoLines = logoText.split('\n');
  const coloredLogo = logoLines.map(line => pc.bgWhite(pc.black(line))).join('\n');
  console.log(coloredLogo);
  
  // Sub-logo flourish
  console.log(`\n           ${pc.red('⛩')} ${pc.white('KAGURA AI')} ${pc.red('⛩')}\n`);

  p.intro(pc.red(pc.bold(' Kagura onboarding ')));

  // Resolve API URL
  const currentConfig = await loadCliConfig();
  const rawApiUrl = process.env.KAGURA_API_URL || currentConfig.apiUrl || 'https://kagura-app.camie.tech';
  const apiUrl = rawApiUrl.replace(/\/$/, '');
  const settingsUrl = `${apiUrl}/settings#api-keys`;

  // Start a visual group for Setup
  p.log.message('');
  p.log.step(pc.red(pc.bold('Authentication')));
  p.log.message(pc.gray('Connect your CLI to your Kagura account to run remote testing agents.'));
  p.log.message('');

  // Prompt to open browser (using select instead of confirm to match the visual style better)
  const openBrowserAction = await p.select({
    message: 'How would you like to get your API key?',
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
    // Give the user a moment to see the spinner before asking for the key
    await new Promise(r => setTimeout(r, 1500));
    s1.stop('Browser opened successfully');
  }

  // Text input
  const apiKey = await p.text({
    message: 'Paste your Kagura API key:',
    placeholder: 'kag_live_...',
    validate(value) {
      if (!value) return 'API key is required';
      if (value.length < 10) return 'Invalid API key format';
    },
  });

  if (p.isCancel(apiKey)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  const keyString = String(apiKey).trim();

  // Verify and Save the config
  const s = p.spinner();
  s.start('Verifying API Key against Kagura Cloud...');
  
  const isValid = await verifyApiKey(keyString, apiUrl);
  
  if (!isValid) {
    s.stop('Verification failed');
    p.cancel(pc.red('Error: The API key provided is invalid or the server is unreachable.'));
    process.exit(1);
  }
  
  s.message('Saving configuration locally...');
  await saveCliConfig({ ...currentConfig, apiKey: keyString, apiUrl });
  s.stop('Configuration saved');

  p.note(
    `${pc.gray('API Key:')} ${pc.green(maskApiKey(keyString))}\n${pc.gray('API URL:')} ${pc.blue(apiUrl)}\n${pc.gray('Configured:')} ${pc.white('~/.kagura/config.json')}`,
    'Setup Complete'
  );

  p.outro(pc.green('You are all set! Run ') + pc.bold(pc.white('kagura run --url <url> --desc "<desc>"')) + pc.green(' to start testing.'));
}
