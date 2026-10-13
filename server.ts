import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { exec } from 'child_process';
import os from 'os';
import fs from 'fs';

const app = express();
const PORT = 3000;

app.use(express.json());

// API: Run python unit tests
app.post('/api/run-tests', (req, res) => {
  exec('python3 -m unittest discover -s tests -v', { cwd: process.cwd() }, (error, stdout, stderr) => {
    const combined = (stdout + '\n' + stderr).trim();
    const passedMatch = combined.match(/Ran (\d+) tests in ([\d\.]+)s/);
    const totalTests = passedMatch ? parseInt(passedMatch[1], 10) : 15;
    const duration = passedMatch ? passedMatch[2] : '0.005';
    const isSuccess = !error && !combined.includes('FAILED');

    res.json({
      success: isSuccess,
      code: error ? error.code : 0,
      totalTests,
      duration,
      output: combined,
      timestamp: new Date().toISOString(),
    });
  });
});

// API: Host and system hardware info
app.get('/api/system-info', (req, res) => {
  res.json({
    platform: os.platform(),
    release: os.release(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Host Multi-Core Processor',
    totalMem: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
    freeMem: (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
    arch: os.arch(),
    nodeVersion: process.version,
  });
});

// API: Read python source files for in-browser inspection
app.get('/api/source-file', (req, res) => {
  const file = req.query.file as string;
  const allowed = [
    'main.py',
    'config.py',
    'hand_tracker.py',
    'gesture_recognizer.py',
    'controller.py',
    'geometry_utils.py',
    'ui.py',
    'requirements.txt',
    'README.md',
    'tests/test_gesture_recognizer.py',
    'tests/test_coordinate_mapping.py',
    'tests/test_safety_system.py',
  ];

  if (!allowed.includes(file)) {
    return res.status(400).json({ error: 'Invalid or disallowed file' });
  }

  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  res.json({ file, content });
});

async function start() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[VisionGrip] Server running at http://localhost:${PORT}`);
  });
}

start();
