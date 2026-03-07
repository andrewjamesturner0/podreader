import { execSync, spawn, ChildProcess } from 'child_process';
import http from 'http';

const DEFAULT_MODEL = 'qwen2.5:3b-instruct';
const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;
const OLLAMA_BASE = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;

interface OllamaTagsResponse {
  models?: Array<{ name: string }>;
}

type SetupPhase = 'idle' | 'installing' | 'starting' | 'pulling' | 'ready' | 'error';

interface SetupState {
  phase: SetupPhase;
  pullProgress?: number;
  error?: string;
}

let ollamaProcess: ChildProcess | null = null;
let setupState: SetupState = { phase: 'idle' };
let setupInProgress = false;

function ollamaGet(path: string, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${OLLAMA_BASE}${path}`, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

export function isInstalled(): boolean {
  try {
    execSync('which ollama', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function install(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr?.on('data', (chunk) => { stderr += chunk; });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Ollama install failed (exit ${code}): ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
}

export async function isRunning(): Promise<boolean> {
  try {
    await ollamaGet('/api/version');
    return true;
  } catch {
    return false;
  }
}

export async function start(): Promise<void> {
  if (await isRunning()) return;

  const proc = spawn('ollama', ['serve'], {
    stdio: 'ignore',
    detached: false,
  });
  ollamaProcess = proc;

  proc.on('error', (err) => {
    console.error('Ollama process error:', err.message);
    ollamaProcess = null;
  });
  proc.on('exit', () => {
    ollamaProcess = null;
  });

  // Poll until ready, up to 15s
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isRunning()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Ollama failed to start within 15 seconds');
}

export async function stop(): Promise<void> {
  if (ollamaProcess) {
    ollamaProcess.kill('SIGTERM');
    ollamaProcess = null;
  }
}

export async function isModelAvailable(model = DEFAULT_MODEL): Promise<boolean> {
  try {
    const data = await ollamaGet('/api/tags', 5000);
    const parsed = JSON.parse(data) as OllamaTagsResponse;
    return parsed.models?.some((m) => m.name === model || m.name === `${model}:latest`) ?? false;
  } catch {
    return false;
  }
}

export async function pullModel(model = DEFAULT_MODEL): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ollama', ['pull', model], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (chunk) => {
      const line = chunk.toString();
      // Ollama pull outputs progress like "pulling abc123... 42%"
      const match = line.match(/(\d+)%/);
      if (match) {
        setupState.pullProgress = parseInt(match[1], 10);
      }
    });

    proc.stderr?.on('data', (chunk) => {
      const line = chunk.toString();
      const match = line.match(/(\d+)%/);
      if (match) {
        setupState.pullProgress = parseInt(match[1], 10);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Model pull failed (exit ${code})`));
    });
    proc.on('error', reject);
  });
}

export async function ensureReady(model = DEFAULT_MODEL): Promise<void> {
  if (setupInProgress) return;
  setupInProgress = true;
  try {
    // Step 1: Install if needed
    if (!isInstalled()) {
      setupState = { phase: 'installing' };
      await install();
    }

    // Step 2: Start if not running
    if (!(await isRunning())) {
      setupState = { phase: 'starting' };
      await start();
    }

    // Step 3: Pull model if not available
    if (!(await isModelAvailable(model))) {
      setupState = { phase: 'pulling', pullProgress: 0 };
      await pullModel(model);
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

export async function getStatus(model = DEFAULT_MODEL) {
  const installed = isInstalled();
  const running = installed ? await isRunning() : false;
  const modelReady = running ? await isModelAvailable(model) : false;
  return {
    installed,
    running,
    modelReady,
    setupPhase: setupState.phase,
    pullProgress: setupState.pullProgress,
    error: setupState.error,
    model,
  };
}
