import express from 'express';
import cors from 'cors';
import pc from 'picocolors';
import open from 'open';
import fs from 'node:fs/promises';
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

  app.get('/', async (_req, res) => {
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
  app.get('/api/runs', async (_req, res) => {
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
  app.get('/api/runs/:id', async (req, res) => {
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
  app.get('/api/screenshots/:runId/:filename', async (req, res) => {
    try {
      const { runId, filename } = req.params;
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

  app.listen(PORT, async () => {
    console.clear();
    const url = `http://localhost:${PORT}`;
    
    console.log(`\n${pc.red('⛩')} ${pc.red('Kagura Local Dashboard')} ${pc.gray('Running')}\n`);
    console.log(`${pc.gray('Listening on:')}  ${pc.cyan(url)}`);
    console.log(`${pc.gray('State dir:')}     ${pc.white(stateDir)}\n`);
    console.log(pc.gray('Press Ctrl+C to stop the server.'));

    // Automatically pop open the browser
    await open(url);
  });
}
