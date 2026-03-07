import { getApiHeaders } from './apiClient';

export interface LocalLlmStatus {
  installed: boolean;
  running: boolean;
  modelReady: boolean;
  setupPhase: string;
  pullProgress?: number;
  error?: string;
  model: string;
}

export async function getLocalLlmStatus(): Promise<LocalLlmStatus> {
  const res = await fetch('/api/local-llm/status', { headers: getApiHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server returned ${res.status}`);
  }
  return res.json();
}

export async function startLocalLlmSetup(): Promise<void> {
  const res = await fetch('/api/local-llm/setup', { method: 'POST', headers: getApiHeaders() });
  if (!res.ok) {
    throw new Error('Failed to start local LLM setup');
  }
}

export async function stopLocalLlm(): Promise<void> {
  const res = await fetch('/api/local-llm/stop', { method: 'POST', headers: getApiHeaders() });
  if (!res.ok) {
    throw new Error('Failed to stop local LLM');
  }
}
