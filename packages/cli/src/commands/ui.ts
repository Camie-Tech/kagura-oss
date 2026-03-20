import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import pc from 'picocolors';
import open from 'open';
import fs from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kaguraStateDir, kaguraScreenshotsDir } from '../config/paths.js';

export async function uiCommand() {
  const app = express();
  const PORT = process.env.KAGURA_UI_PORT || 3005;
  const stateDir = kaguraStateDir();
  const screenshotsDir = kaguraScreenshotsDir();

  app.use(cors());

  // Serve static UI from compiled source
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uiHtmlPath = path.resolve(__dirname, '../ui/index.html');

  app.get('/', async (_req: Request, res: Response) => {
    try {
      const html = await fs.readFile(uiHtmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      console.error(`Failed to load UI from: ${uiHtmlPath}`, err);
      res.status(500).send(`Error loading local dashboard UI. Path tried: ${uiHtmlPath}`);
    }
  });

  // API to list all local runs
  app.get('/api/runs', async (_req: Request, res: Response) => {
    try {
      await fs.mkdir(stateDir, { recursive: true });
      const files = await fs.readdir(stateDir);

      const runs = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async (file) => {
            try {
              const filePath = path.join(stateDir, file);
              const stat = await fs.stat(filePath);
              const id = file.replace('.json', '');

              // Parse the JSON to get actual status and URL
              const raw = await fs.readFile(filePath, 'utf8');
              const data = JSON.parse(raw);

              // Determine status from steps
              const steps = data.steps || [];
              const hasFailed = steps.some((s: any) => s.status === 'failed');

              return {
                id,
                timestamp: stat.mtimeMs,
                status: hasFailed ? 'failed' : 'passed',
                url: data.currentUrl || null,
                stepsCount: steps.length,
                name: data.testName || data.name || data.description || null,
                verdict: data.result || data.verdict || null,
              };
            } catch {
              return null;
            }
          })
      );

      // Filter out nulls and sort newest first
      const validRuns = runs.filter(r => r !== null);
      validRuns.sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0));
      res.json(validRuns);
    } catch (err) {
      res.status(500).json({ error: 'Failed to read state directory' });
    }
  });

  // API to get specific run details
  app.get('/api/runs/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      // Basic sanitization
      if (id.includes('..') || id.includes('/')) return res.status(400).json({ error: 'Invalid ID' });

      const filePath = path.join(stateDir, `${id}.json`);
      const raw = await fs.readFile(filePath, 'utf8');
      res.json(JSON.parse(raw));
    } catch (err) {
      res.status(404).json({ error: 'Trace not found' });
    }
  });

  // Serve screenshots
  app.get('/api/screenshots/:runId/:filename', async (req: Request, res: Response) => {
    try {
      const runId = req.params.runId as string;
      const filename = req.params.filename as string;
      // Sanitize
      if (runId.includes('..') || filename.includes('..')) {
        return res.status(400).send('Invalid path');
      }

      const imgPath = path.join(screenshotsDir, runId, filename);
      const data = await fs.readFile(imgPath);

      // Set content type based on extension
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      res.send(data);
    } catch (err) {
      res.status(404).send('Screenshot not found');
    }
  });

  // === SSE: Server-Sent Events for live dashboard updates ===
  const sseClients = new Set<Response>();

  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if proxied
    res.flushHeaders();

    sseClients.add(res);

    // Send initial heartbeat so client knows connection is live
    res.write('event: connected\ndata: {}\n\n');

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  function broadcastSSE(event: string, data: Record<string, unknown>) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      client.write(payload);
    }
  }

  // File watcher with debounce
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let watcher: FSWatcher | null = null;

  async function startFileWatcher() {
    // Ensure directory exists
    await fs.mkdir(stateDir, { recursive: true });

    try {
      watcher = watch(stateDir, { persistent: true }, (_eventType, filename) => {
        // Only react to .json files
        if (!filename || !filename.endsWith('.json')) return;

        // Debounce: coalesce rapid writes into a single event
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          broadcastSSE('runs-updated', { trigger: filename });
        }, 300);
      });

      watcher.on('error', (err) => {
        console.error(pc.yellow('File watcher error:'), err.message);
      });
    } catch (err) {
      console.error(pc.yellow('Could not start file watcher:'), err);
    }
  }

  app.listen(PORT, async () => {
    console.clear();
    const url = `http://localhost:${PORT}`;

    console.log(`\n${pc.red('⛩')} ${pc.red('Kagura Local Dashboard')} ${pc.gray('Running')}\n`);
    console.log(`${pc.gray('Listening on:')}  ${pc.cyan(url)}`);
    console.log(`${pc.gray('State dir:')}     ${pc.white(stateDir)}`);
    console.log(`${pc.gray('Live updates:')} ${pc.green('SSE enabled')}\n`);
    console.log(pc.gray('Press Ctrl+C to stop the server.'));

    // Start watching state directory for changes
    await startFileWatcher();

    // Automatically pop open the browser
    await open(url);
  });

  // Clean up watcher on process exit
  process.on('SIGINT', () => {
    watcher?.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    watcher?.close();
    process.exit(0);
  });
}
