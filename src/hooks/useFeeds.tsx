import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Feed, Episode } from '../types';
import * as db from '../services/dataApi';
import { fetchFeed } from '../services/feedService';
import { extractYouTubeVideoId } from '../utils/youtube';
import { fetchYouTubeInfo } from '../services/youtubeService';

export const ALL_SUMMARIES_URL = '__all-summaries__';
export const ALL_EPISODES_URL = '__all-episodes__';
export const YOUTUBE_FEED_URL = '__youtube__';

interface ImportProgress {
  current: number;
  total: number;
  currentFeed: string;
  succeeded: number;
  failed: number;
}

type EpisodeStatus = 'none' | 'transcribed' | 'summarised';

interface FeedContextValue {
  feeds: Feed[];
  selectedFeedUrl: string | null;
  selectedEpisodeId: string | null;
  episodes: Episode[];
  episodeStatuses: Record<string, EpisodeStatus>;
  feedErrors: Record<string, string>;
  refreshStatuses: () => void;
  selectFeed: (url: string | null) => void;
  selectEpisode: (id: string | null) => void;
  subscribe: (url: string) => Promise<void>;
  unsubscribe: (url: string) => Promise<void>;
  refreshFeed: (url: string) => Promise<void>;
  refreshAllFeeds: () => Promise<void>;
  addYouTubeVideo: (url: string) => Promise<void>;
  importFeeds: (urls: { url: string; title: string }[]) => Promise<{ succeeded: number; failed: number; skipped: number }>;
  importProgress: ImportProgress | null;
  loading: boolean;
  error: string | null;
}

const FeedContext = createContext<FeedContextValue>(null!);

function buildFeed(url: string, data: { title: string; description: string; imageUrl: string }): Feed {
  return {
    url,
    title: data.title,
    description: data.description,
    imageUrl: data.imageUrl,
    lastFetchedAt: Date.now(),
  };
}

export function FeedProvider({ children }: { children: ReactNode }) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedFeedUrl, setSelectedFeedUrl] = useState<string | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [episodeStatuses, setEpisodeStatuses] = useState<Record<string, EpisodeStatus>>({});
  const [feedErrors, setFeedErrors] = useState<Record<string, string>>({});

  const refreshStatuses = useCallback(() => {
    db.getEpisodeStatuses().then(setEpisodeStatuses).catch(() => {});
  }, []);

  // Load feeds and statuses on mount
  useEffect(() => {
    db.getAllFeeds().then(setFeeds);
    refreshStatuses();
  }, []);

  // Load episodes when feed is selected
  useEffect(() => {
    let stale = false;
    if (!selectedFeedUrl) {
      setEpisodes([]);
      return;
    }
    const promise = selectedFeedUrl === ALL_SUMMARIES_URL
      ? db.getSummarisedEpisodes()
      : selectedFeedUrl === ALL_EPISODES_URL
      ? db.getAllEpisodes()
      : db.getEpisodesByFeed(selectedFeedUrl);  // works for YOUTUBE_FEED_URL too
    promise.then(eps => { if (!stale) setEpisodes(eps); });
    return () => { stale = true; };
  }, [selectedFeedUrl]);

  const selectFeed = useCallback((url: string | null) => {
    setSelectedFeedUrl(url);
    setSelectedEpisodeId(null);
    setError(null);
  }, []);

  const selectEpisode = useCallback((id: string | null) => {
    setSelectedEpisodeId(id);
  }, []);

  const subscribe = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFeed(url);
      const feed = buildFeed(url, data);
      await db.saveFeed(feed);
      await db.saveEpisodes(data.episodes.map(ep => ({ ...ep, feedUrl: url })));
      const allFeeds = await db.getAllFeeds();
      setFeeds(allFeeds);
      setSelectedFeedUrl(url);
      const eps = await db.getEpisodesByFeed(url);
      setEpisodes(eps);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to subscribe');
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async (url: string) => {
    await db.deleteFeed(url);
    const allFeeds = await db.getAllFeeds();
    setFeeds(allFeeds);
    if (selectedFeedUrl === url) {
      setSelectedFeedUrl(null);
      setEpisodes([]);
      setSelectedEpisodeId(null);
    }
  }, [selectedFeedUrl]);

  const refreshFeed = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFeed(url);
      const feed = buildFeed(url, data);
      await db.saveFeed(feed);
      await db.saveEpisodes(data.episodes.map(ep => ({ ...ep, feedUrl: url })));
      setFeedErrors(prev => { const next = { ...prev }; delete next[url]; return next; });
      const allFeeds = await db.getAllFeeds();
      setFeeds(allFeeds);
      if (selectedFeedUrl === url) {
        const eps = await db.getEpisodesByFeed(url);
        setEpisodes(eps);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to refresh feed';
      setFeedErrors(prev => ({ ...prev, [url]: msg }));
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedFeedUrl]);

  const refreshAllFeeds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await db.refreshAllFeeds();
      // Set per-feed errors from server response
      setFeedErrors(result.errors || {});
      if (result.failed > 0) {
        setError(`${result.failed} feed(s) failed to refresh`);
      }
      const allFeeds = await db.getAllFeeds();
      setFeeds(allFeeds);
      if (selectedFeedUrl === ALL_SUMMARIES_URL) {
        const eps = await db.getSummarisedEpisodes();
        setEpisodes(eps);
      } else if (selectedFeedUrl === ALL_EPISODES_URL) {
        const eps = await db.getAllEpisodes();
        setEpisodes(eps);
      } else if (selectedFeedUrl) {
        const eps = await db.getEpisodesByFeed(selectedFeedUrl);
        setEpisodes(eps);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh feeds');
    } finally {
      setLoading(false);
    }
  }, [selectedFeedUrl]);

  const addYouTubeVideo = useCallback(async (url: string) => {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      setError('Invalid YouTube URL');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const info = await fetchYouTubeInfo(url);
      // Ensure the YouTube virtual feed exists
      const ytFeed: Feed = {
        url: YOUTUBE_FEED_URL,
        title: 'YouTube',
        description: 'YouTube videos',
        imageUrl: '',
        lastFetchedAt: Date.now(),
      };
      await db.saveFeed(ytFeed);
      // Save the video as an episode
      const episode: Episode = {
        guid: `yt:${info.videoId}`,
        feedUrl: YOUTUBE_FEED_URL,
        title: info.title,
        pubDate: info.pubDate,
        duration: info.duration,
        audioUrl: url, // original YouTube URL, used by transcript endpoint
        description: info.description,
      };
      await db.saveEpisodes([episode]);
      const allFeeds = await db.getAllFeeds();
      setFeeds(allFeeds);
      setSelectedFeedUrl(YOUTUBE_FEED_URL);
      const eps = await db.getEpisodesByFeed(YOUTUBE_FEED_URL);
      setEpisodes(eps);
      setSelectedEpisodeId(`yt:${info.videoId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add YouTube video');
    } finally {
      setLoading(false);
    }
  }, []);

  const importFeeds = useCallback(async (entries: { url: string; title: string }[]) => {
    setError(null);
    const existingUrls = new Set(feeds.map(f => f.url));
    const toImport = entries.filter(e => !existingUrls.has(e.url));
    const skipped = entries.length - toImport.length;

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < toImport.length; i++) {
      const entry = toImport[i];
      setImportProgress({
        current: i + 1,
        total: toImport.length,
        currentFeed: entry.title || entry.url,
        succeeded,
        failed,
      });

      try {
        const data = await fetchFeed(entry.url);
        const feed = buildFeed(entry.url, { ...data, title: data.title || entry.title });
        await db.saveFeed(feed);
        await db.saveEpisodes(data.episodes.map(ep => ({ ...ep, feedUrl: entry.url })));
        succeeded++;
        // Update feed list after each successful import so UI stays current
        const updated = await db.getAllFeeds();
        setFeeds(updated);
      } catch {
        failed++;
      }
    }

    setImportProgress(null);
    return { succeeded, failed, skipped };
  }, [feeds]);

  return (
    <FeedContext.Provider
      value={{
        feeds,
        selectedFeedUrl,
        selectedEpisodeId,
        episodes,
        episodeStatuses,
        feedErrors,
        refreshStatuses,
        selectFeed,
        selectEpisode,
        subscribe,
        unsubscribe,
        refreshFeed,
        refreshAllFeeds,
        addYouTubeVideo,
        importFeeds,
        importProgress,
        loading,
        error,
      }}
    >
      {children}
    </FeedContext.Provider>
  );
}

export function useFeeds() {
  return useContext(FeedContext);
}
