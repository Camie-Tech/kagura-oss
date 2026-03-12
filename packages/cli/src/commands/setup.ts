import * as p from '@clack/prompts';
import pc from 'picocolors';
import figlet from 'figlet';
import open from 'open';
import { saveCliConfig, loadCliConfig } from '../config/config.js';
import https from 'node:https';
import http from 'node:http';

function maskApiKey(key: string): string {
  if (!key || key.length < 15) return '*'.repeat(key.length);
  // Show first 9 (e.g., kag_live_), then *, then last 2.
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
  
  // Render ASCII Art Logo
  const logo = figlet.textSync('KAGURA', { font: 'Slant' });
  console.log(pc.red(logo));
  console.log(pc.gray('  Give me a URL and I\'ll give you peace of mind.\n'));

  p.intro(pc.bgRed(pc.white(' Kagura CLI Setup ')));

  // Resolve API URL (allows overrides via config or env)
  const currentConfig = await loadCliConfig();
  const rawApiUrl = process.env.KAGURA_API_URL || currentConfig.apiUrl || 'https://kagura-app.camie.tech';
  // Strip trailing slash if present
  const apiUrl = rawApiUrl.replace(/\/$/, '');
  
  const settingsUrl = `${apiUrl}/settings#api-keys`;

  // Prompt to open browser
  const openBrowser = await p.confirm({
    message: 'Press Enter to open your browser to generate your Kagura API key.',
    initialValue: true,
  });

  if (p.isCancel(openBrowser)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  if (openBrowser) {
    p.log.info(`Opening ${pc.cyan(settingsUrl)}...`);
    await open(settingsUrl);
  }

  // Text input with custom masking
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
  s.start('Verifying API Key...');
  
  const isValid = await verifyApiKey(keyString, apiUrl);
  
  if (!isValid) {
    s.stop('Verification failed');
    p.cancel(pc.red('Error: The API key provided is invalid or the server is unreachable.'));
    process.exit(1);
  }
  
  s.message('Saving configuration...');
  await saveCliConfig({ ...currentConfig, apiKey: keyString, apiUrl });
  s.stop('Configuration saved');

  p.note(
    `API Key: ${pc.green(maskApiKey(keyString))}\nAPI URL: ${pc.blue(apiUrl)}\n\nConfig saved to ~/.kagura/config.json`,
    'Setup Complete'
  );

  p.outro(pc.green('You are all set! Run ' + pc.bold('kagura run --url <url> --desc "<desc>"') + ' to start testing.'));
}
