import { json } from './apiClient';

export async function summariseTranscript(opts: {
  transcript: string;
  provider: 'openai' | 'anthropic' | 'ollama';
}): Promise<string> {
  const data = await json<{ summary: string }>(await fetch('/api/summarise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: opts.transcript,
      provider: opts.provider,
    }),
  }));
  return data.summary;
}
