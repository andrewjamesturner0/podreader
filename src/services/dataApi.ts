import type { Feed, Episode, Transcript, Summary } from '../types';
import { json } from './apiClient';

const DATA = '/api/data';

// Feeds

export async function getAllFeeds(): Promise<Feed[]> {
  return json(await fetch(`${DATA}/feeds`));
}

export async function saveFeed(feed: Feed): Promise<void> {
  await json(await fetch(`${DATA}/feeds`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feed),
  }));
}

export async function deleteFeed(url: string): Promise<void> {
  await json(await fetch(`${DATA}/feeds`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }));
}

// Episodes

export async function getEpisodesByFeed(feedUrl: string): Promise<Episode[]> {
  return json(await fetch(`${DATA}/episodes?feedUrl=${encodeURIComponent(feedUrl)}`));
}

export async function saveEpisodes(episodes: Episode[]): Promise<void> {
  await json(await fetch(`${DATA}/episodes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(episodes),
  }));
}

export async function getAllEpisodes(): Promise<Episode[]> {
  return json(await fetch(`${DATA}/episodes`));
}

export async function getSummarisedEpisodes(): Promise<Episode[]> {
  return json(await fetch(`${DATA}/episodes/summarised`));
}

export async function getEpisodeStatuses(): Promise<Record<string, 'transcribed' | 'summarised'>> {
  return json(await fetch(`${DATA}/episodes/statuses`));
}

// Transcripts

export async function getTranscript(episodeId: string): Promise<Transcript | undefined> {
  const result = await json<Transcript | null>(await fetch(`${DATA}/transcripts/${encodeURIComponent(episodeId)}`));
  return result ?? undefined;
}

export async function saveTranscript(transcript: Transcript): Promise<void> {
  await json(await fetch(`${DATA}/transcripts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transcript),
  }));
}

// Summaries

export async function getSummary(episodeId: string): Promise<Summary | undefined> {
  const result = await json<Summary | null>(await fetch(`${DATA}/summaries/${encodeURIComponent(episodeId)}`));
  return result ?? undefined;
}

export async function saveSummary(summary: Summary): Promise<void> {
  await json(await fetch(`${DATA}/summaries`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(summary),
  }));
}

// Feed refresh

export async function refreshAllFeeds(): Promise<{ succeeded: number; failed: number; errors: Record<string, string> }> {
  return json(await fetch('/api/refresh-feeds', { method: 'POST' }));
}

// Settings

export async function getSetting(key: string): Promise<string | undefined> {
  const result = await json<{ value: string | null }>(await fetch(`${DATA}/settings/${encodeURIComponent(key)}`));
  return result.value ?? undefined;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await json(await fetch(`${DATA}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  }));
}
