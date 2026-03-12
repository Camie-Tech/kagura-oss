import express from 'express';
import cors from 'cors';
import pc from 'picocolors';
import open from 'open';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kaguraStateDir } from '../config/paths.js';

export async function uiCommand() {
  const app = express();
  const PORT = process.env.KAGURA_UI_PORT || 3005;
  const stateDir = kaguraStateDir();

  app.use(cors());

  // Serve static UI from compiled source
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uiHtmlPath = path.resolve(__dirname, '../ui/index.html');

  app.get('/', async (req, res) => {
    try {
      const html = await fs.readFile(uiHtmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      res.status(500).send('Error loading local dashboard UI. Did you run the build step?');
    }
  });

  // API to list all local runs
  app.get('/api/runs', async (req, res) => {
    try {
      await fs.mkdir(stateDir, { recursive: true });
      const files = await fs.readdir(stateDir);
      
      const runs = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async (file) => {
            const stat = await fs.stat(path.join(stateDir, file));
            const id = file.replace('.json', '');
            return {
              id,
              timestamp: stat.mtimeMs,
              status: 'completed' // Mocking status for now until we parse the JSON
            };
          })
      );

      // Sort newest first
      runs.sort((a, b) => b.timestamp - a.timestamp);
      res.json(runs);
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
