import type { Episode } from '../types';
import { json } from './apiClient';

interface FeedResponse {
  title: string;
  description: string;
  imageUrl: string;
  episodes: Episode[];
}

export async function fetchFeed(url: string): Promise<FeedResponse> {
  return json(await fetch(`/api/feed?url=${encodeURIComponent(url)}`));
}
