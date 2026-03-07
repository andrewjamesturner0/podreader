import { json } from './apiClient';

export async function transcribeEpisode(
  audioUrl: string,
  provider: string = 'openai'
): Promise<string> {
  const data = await json<{ transcript: string }>(await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioUrl, provider }),
  }));
  return data.transcript;
}
