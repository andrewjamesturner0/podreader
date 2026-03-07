import { execSync, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';

const WHISPER_PORT = 8178;
const WHISPER_HOST = '127.0.0.1';
const WHISPER_BASE = `http://${WHISPER_HOST}:${WHISPER_PORT}`;
const MODEL_NAME = 'ggml-base.en.bin';
// Use /var/lib/podreader for model storage — writable even under ProtectHome=read-only
const CACHE_DIR = '/var/lib/podreader';
const MODEL_PATH = path.join(CACHE_DIR, MODEL_NAME);
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`;

type SetupPhase = 'idle' | 'downloading-binary' | 'downloading-model' | 'starting' | 'ready' | 'error';

interface SetupState {
  phase: SetupPhase;
  error?: string;
}

let whisperProcess: ChildProcess | null = null;
let setupState: SetupState = { phase: 'idle' };
let setupInProgress = false;

function whisperGet(urlPath: string, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${WHISPER_BASE}${urlPath}`, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function findBinary(): string | null {
  // Check well-known locations
  const candidates = [
    '/usr/local/bin/whisper-server',
    path.join(CACHE_DIR, 'whisper-server'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Check PATH
  try {
    const result = execSync('which whisper-server', { stdio: ['ignore', 'pipe', 'ignore'] });
    const found = result.toString().trim();
    if (found) return found;
  } catch {
    // not on PATH
  }
  return null;
}

export function isInstalled(): boolean {
  return findBinary() !== null;
}

function isModelDownloaded(): boolean {
  return fs.existsSync(MODEL_PATH);
}

export async function isRunning(): Promise<boolean> {
  try {
    await whisperGet('/');
    return true;
  } catch {
    return false;
  }
}

async function downloadModel(): Promise<void> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return new Promise((resolve, reject) => {
    const proc = spawn('curl', [
      '-fSL',
      '-o', MODEL_PATH,
      MODEL_URL,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr?.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Model download failed (exit ${code}): ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
}

export async function start(): Promise<void> {
  if (await isRunning()) return;

  const binary = findBinary();
  if (!binary) {
    throw new Error('whisper-server binary not found. Install it to /usr/local/bin/whisper-server or ~/.cache/whisper-cpp/whisper-server');
  }

  const proc = spawn(binary, [
    '--model', MODEL_PATH,
    '--host', WHISPER_HOST,
    '--port', String(WHISPER_PORT),
    '--convert',
    '--tmp-dir', '/tmp',
    '--print-progress',
  ], {
    stdio: 'ignore',
    detached: false,
  });
  whisperProcess = proc;

  proc.on('error', (err) => {
    console.error('whisper-server process error:', err.message);
    whisperProcess = null;
  });
  proc.on('exit', () => {
    whisperProcess = null;
  });

  // Poll until ready, up to 30s (model loading can be slow)
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isRunning()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('whisper-server failed to start within 30 seconds');
}

export async function stop(): Promise<void> {
  if (whisperProcess) {
    whisperProcess.kill('SIGTERM');
    whisperProcess = null;
  }
}

export async function ensureReady(): Promise<void> {
  if (setupInProgress) return;
  setupInProgress = true;
  try {
    // Step 1: Check binary
    if (!isInstalled()) {
      setupState = { phase: 'error', error: 'whisper-server binary not found. Install it to /usr/local/bin/whisper-server or ~/.cache/whisper-cpp/whisper-server' };
      throw new Error(setupState.error);
    }

    // Step 2: Download model if needed
    if (!isModelDownloaded()) {
      setupState = { phase: 'downloading-model' };
      console.log(`Downloading whisper model to ${MODEL_PATH}...`);
      await downloadModel();
      console.log('Whisper model download complete.');
    }

    // Step 3: Start server if not running
    if (!(await isRunning())) {
      setupState = { phase: 'starting' };
      await start();
    }

    setupState = { phase: 'ready' };
  } catch (err: any) {
    setupState = { phase: 'error', error: err.message };
    throw err;
  } finally {
    setupInProgress = false;
  }
}

export function getSetupState(): SetupState {
  return { ...setupState };
}

export async function getStatus() {
  const installed = isInstalled();
  const modelDownloaded = isModelDownloaded();
  const running = installed && modelDownloaded ? await isRunning() : false;
  return {
    installed,
    modelDownloaded,
    running,
    modelReady: running,
    setupPhase: setupState.phase,
    error: setupState.error,
    model: MODEL_NAME,
    binaryPath: findBinary(),
  };
}
