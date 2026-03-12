import * as p from '@clack/prompts';
import pc from 'picocolors';
import figlet from 'figlet';
import open from 'open';
import { saveCliConfig, loadCliConfig } from '../config/config.js';

function maskApiKey(key: string): string {
  if (!key || key.length < 15) return '*'.repeat(key.length);
  // kag_live_ + remaining. Show first 9 (kag_live_), then *, then last 2.
  const prefix = key.slice(0, 9);
  const suffix = key.slice(-2);
  const hidden = '*'.repeat(key.length - 11);
  return `${prefix}${hidden}${suffix}`;
}

export async function setupCommand() {
  console.clear();
  
  // Render ASCII Art Logo
  const logo = figlet.textSync('KAGURA', { font: 'Slant' });
  console.log(pc.red(logo));
  console.log(pc.gray('  Give me a URL and I\'ll give you peace of mind.\n'));

  p.intro(pc.bgRed(pc.white(' Kagura CLI Setup ')));

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
    p.log.info(`Opening ${pc.cyan('https://app.kagura.run/settings/api-keys')}...`);
    await open('https://app.kagura.run/settings/api-keys');
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

  // Save the config
  const s = p.spinner();
  s.start('Saving configuration');
  
  const currentConfig = await loadCliConfig();
  await saveCliConfig({ ...currentConfig, apiKey: keyString });
  
  s.stop('Configuration saved');

  p.note(
    `API Key: ${pc.green(maskApiKey(keyString))}\n\nConfig saved to ~/.kagura/config.json`,
    'Setup Complete'
  );

  p.outro(pc.green('You are all set! Run ' + pc.bold('kagura run --url <url> --desc "<desc>"') + ' to start testing.'));
}
