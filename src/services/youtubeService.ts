import { json } from './apiClient';

export interface YouTubeInfo {
  videoId: string;
  title: string;
  description: string;
  duration: string;
  pubDate: string;
  thumbnailUrl: string;
}

export async function fetchYouTubeInfo(url: string): Promise<YouTubeInfo> {
  return json<YouTubeInfo>(await fetch('/api/youtube/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }));
}

export async function transcribeYouTube(
  url: string,
  provider: string = 'openai'
): Promise<{ transcript: string; source: 'captions' | 'whisper' }> {
  return json(await fetch('/api/youtube/transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, provider }),
  }));
}
