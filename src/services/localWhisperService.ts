import { getApiHeaders } from './apiClient';

export interface LocalWhisperStatus {
  installed: boolean;
  running: boolean;
  modelReady: boolean;
  setupPhase: string;
  downloadProgress?: number;
  error?: string;
  model: string;
}

export async function getLocalWhisperStatus(): Promise<LocalWhisperStatus> {
  const res = await fetch('/api/local-whisper/status', { headers: getApiHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server returned ${res.status}`);
  }
  return res.json();
}

export async function startLocalWhisperSetup(): Promise<void> {
  const res = await fetch('/api/local-whisper/setup', { method: 'POST', headers: getApiHeaders() });
  if (!res.ok) {
    throw new Error('Failed to start local whisper setup');
  }
}

export async function stopLocalWhisper(): Promise<void> {
  const res = await fetch('/api/local-whisper/stop', { method: 'POST', headers: getApiHeaders() });
  if (!res.ok) {
    throw new Error('Failed to stop local whisper');
  }
}
