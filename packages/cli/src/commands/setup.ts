import * as p from '@clack/prompts';
import pc from 'picocolors';
import figlet from 'figlet';
import open from 'open';
import { saveCliConfig, loadCliConfig, type EmailConfig } from '../config/config.js';
import https from 'node:https';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function maskApiKey(key: string): string {
  if (!key || key.length < 12) return '*'.repeat(key.length);
  // Support both sk-ant- and kag_live_ prefixes
  if (key.startsWith('kag_live_')) {
    // Show prefix + last 2 chars: kag_live_****ab
    const prefix = 'kag_live_';
    const suffix = key.slice(-2);
    const hidden = '*'.repeat(Math.max(4, key.length - prefix.length - 2));
    return `${prefix}${hidden}${suffix}`;
  } else if (key.startsWith('sk-ant-')) {
    // Anthropic: show prefix + last 4 chars
    const prefix = key.slice(0, 14);
    const suffix = key.slice(-4);
    const hidden = '*'.repeat(Math.max(4, key.length - 14 - 4));
    return `${prefix}${hidden}${suffix}`;
  }
  // Generic fallback
  const prefix = key.slice(0, 4);
  const suffix = key.slice(-2);
  const hidden = '*'.repeat(Math.max(4, key.length - 6));
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
  // Don't clear screen — keep command history visible
  console.log('');
  
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

    const apiKey = await p.text({
      message: 'Paste your Kagura API key:',
      validate(value) {
        if (!value) return 'API key is required';
        if (!String(value).startsWith('kag_live_')) return 'Must start with kag_live_';
        if (value.length < 20) return 'Invalid API key - too short';
      }
    });

    if (p.isCancel(apiKey)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    const keyString = String(apiKey).trim();
    
    // Show masked version: kag_live_****sk
    p.log.message(pc.gray(`Key received: ${maskApiKey(keyString)}`));
    
    const s = p.spinner();
    s.start('Validating API key format...');
    
    if (keyString.length < 20) {
      s.stop('Validation failed');
      p.cancel(pc.red('Error: Invalid API key - too short.'));
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

  // --- EMAIL SKILL (optional, OSS local mode only) ---
  if (runMode === 'local') {
    const emailConfig = await promptEmailSetup(currentConfig.email);
    if (emailConfig) {
      const updated = await loadCliConfig();
      await saveCliConfig({ ...updated, email: emailConfig });
    }
  }

  p.outro(pc.green('You are all set! Run ') + pc.bold(pc.white('kagura run --url <url> --desc "<desc>"')) + pc.green(' to start testing.'));
}

// ── Email Skill Setup ────────────────────────────────────────────────────

async function promptEmailSetup(existing?: EmailConfig): Promise<EmailConfig | null> {
  p.log.message('');
  p.log.step(pc.red(pc.bold('Email Skill (Optional)')));
  p.log.message(pc.gray('Configure email to let the agent handle signup/verification flows.'));
  p.log.message(pc.gray('Uses the +N trick: daniel@site.com → daniel+1@site.com, daniel+2@site.com, etc.'));
  p.log.message('');

  const wantEmail = await p.confirm({
    message: 'Configure email skill for automated auth flows?',
    initialValue: Boolean(existing),
  });

  if (p.isCancel(wantEmail) || !wantEmail) return null;

  const baseEmail = await p.text({
    message: 'Base email address (all +N variations go to this inbox):',
    placeholder: 'daniel@camie.tech',
    initialValue: existing?.baseEmail,
    validate(value) {
      if (!value) return 'Email is required';
      if (!value.includes('@')) return 'Must be a valid email address';
    },
  });
  if (p.isCancel(baseEmail)) return null;

  p.log.message('');
  p.log.step(pc.red(pc.bold('IMAP Configuration')));
  p.log.message(pc.gray('Required for reading confirmation/verification emails.'));

  const imapHost = await p.text({
    message: 'IMAP server host:',
    placeholder: 'imap.gmail.com',
    initialValue: existing?.imap?.host,
    validate(v) { if (!v) return 'Required'; },
  });
  if (p.isCancel(imapHost)) return null;

  const imapPort = await p.text({
    message: 'IMAP port:',
    placeholder: '993',
    initialValue: String(existing?.imap?.port ?? 993),
    validate(v) { if (!v || isNaN(Number(v))) return 'Must be a number'; },
  });
  if (p.isCancel(imapPort)) return null;

  const imapUser = await p.text({
    message: 'IMAP username (usually your email):',
    placeholder: baseEmail as string,
    initialValue: existing?.imap?.auth?.user ?? (baseEmail as string),
    validate(v) { if (!v) return 'Required'; },
  });
  if (p.isCancel(imapUser)) return null;

  const imapPass = await p.password({
    message: 'IMAP password or app password:',
    validate(v) { if (!v) return 'Required'; },
  });
  if (p.isCancel(imapPass)) return null;

  // SMTP is optional
  const wantSmtp = await p.confirm({
    message: 'Configure SMTP for sending emails? (optional)',
    initialValue: Boolean(existing?.smtp),
  });
  if (p.isCancel(wantSmtp)) return null;

  let smtp: EmailConfig['smtp'] = undefined;

  if (wantSmtp) {
    const smtpHost = await p.text({
      message: 'SMTP server host:',
      placeholder: 'smtp.gmail.com',
      initialValue: existing?.smtp?.host,
      validate(v) { if (!v) return 'Required'; },
    });
    if (p.isCancel(smtpHost)) return null;

    const smtpPort = await p.text({
      message: 'SMTP port:',
      placeholder: '587',
      initialValue: String(existing?.smtp?.port ?? 587),
      validate(v) { if (!v || isNaN(Number(v))) return 'Must be a number'; },
    });
    if (p.isCancel(smtpPort)) return null;

    const smtpUser = await p.text({
      message: 'SMTP username:',
      placeholder: baseEmail as string,
      initialValue: existing?.smtp?.auth?.user ?? (baseEmail as string),
      validate(v) { if (!v) return 'Required'; },
    });
    if (p.isCancel(smtpUser)) return null;

    const smtpPass = await p.password({
      message: 'SMTP password:',
      validate(v) { if (!v) return 'Required'; },
    });
    if (p.isCancel(smtpPass)) return null;

    smtp = {
      host: smtpHost as string,
      port: Number(smtpPort),
      secure: Number(smtpPort) === 465,
      auth: { user: smtpUser as string, pass: smtpPass as string },
    };
  }

  const emailConfig: EmailConfig = {
    baseEmail: baseEmail as string,
    imap: {
      host: imapHost as string,
      port: Number(imapPort),
      secure: Number(imapPort) === 993,
      auth: { user: imapUser as string, pass: imapPass as string },
    },
    ...(smtp ? { smtp } : {}),
  };

  p.note(
    `${pc.gray('Base Email:')} ${pc.green(emailConfig.baseEmail)}\n${pc.gray('IMAP:')} ${pc.cyan(`${emailConfig.imap.host}:${emailConfig.imap.port}`)}\n${smtp ? `${pc.gray('SMTP:')} ${pc.cyan(`${smtp.host}:${smtp.port}`)}` : `${pc.gray('SMTP:')} ${pc.yellow('Not configured')}`}`,
    'Email Skill Configured'
  );

  return emailConfig;
}
