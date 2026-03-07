import { Router } from 'express';
import Parser from 'rss-parser';
import { getDb } from '../db.js';
import { validateUrl } from '../utils/urlValidation.js';

const router = Router();
const parser = new Parser({
  customFields: {
    item: [['itunes:duration', 'itunesDuration'], ['enclosure', 'enclosure']],
  },
});

// Reuse the same XML sanitiser from proxy.ts
function sanitizeXml(xml: string): string {
  return xml.replace(/<([a-zA-Z][a-zA-Z0-9:_-]*)((?:\s+[a-zA-Z][a-zA-Z0-9:_-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*\s*)(\/?)>/g,
    (_match, tag, attrs, close) => {
      const fixed = attrs.replace(
        /\s+([a-zA-Z][a-zA-Z0-9:_-]*)(?=\s+[a-zA-Z]|\/?>|\s*$)(?!\s*=)/g,
        ' $1="$1"'
      );
      return `<${tag}${fixed}${close}>`;
    }
  );
}

interface FeedResult {
  url: string;
  ok: boolean;
  error?: string;
}

async function refreshFeedUrl(url: string, userId: number): Promise<FeedResult> {
  const validation = await validateUrl(url);
  if (!validation.valid) {
    return { url, ok: false, error: validation.error };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PodReader/1.0' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const rawXml = await response.text();
    const xml = sanitizeXml(rawXml);
    const feed = await parser.parseString(xml);

    // Sanitise image URL
    const rawImageUrl = feed.image?.url || (feed as any).itunes?.image || '';
    let safeImageUrl = '';
    if (rawImageUrl) {
      try {
        const imgParsed = new URL(rawImageUrl);
        if (imgParsed.protocol === 'http:' || imgParsed.protocol === 'https:') {
          safeImageUrl = rawImageUrl;
        }
      } catch { /* invalid URL */ }
    }

    const db = getDb();

    // Update feed metadata
    db.prepare(`INSERT INTO feeds (url, user_id, title, description, image_url, last_fetched_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(url, user_id) DO UPDATE SET
                  title = excluded.title,
                  description = excluded.description,
                  image_url = excluded.image_url,
                  last_fetched_at = excluded.last_fetched_at`)
      .run(url, userId, feed.title || '', feed.description || '', safeImageUrl, Date.now());

    // Upsert episodes
    const episodes = (feed.items || []).map(item => ({
      guid: item.guid || item.link || item.title || '',
      feedUrl: url,
      title: item.title || 'Untitled',
      pubDate: item.isoDate || item.pubDate || '',
      duration: (item as any).itunesDuration || '',
      audioUrl: item.enclosure?.url || (item as any).enclosure?.['$']?.url || '',
      description: item.contentSnippet || item.content || '',
    }));

    const stmt = db.prepare(`INSERT INTO episodes (guid, feed_url, user_id, title, pub_date, duration, audio_url, description)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                             ON CONFLICT(guid, user_id) DO UPDATE SET
                               feed_url = excluded.feed_url,
                               title = excluded.title,
                               pub_date = excluded.pub_date,
                               duration = excluded.duration,
                               audio_url = excluded.audio_url,
                               description = excluded.description`);
    const insertMany = db.transaction((eps: typeof episodes) => {
      for (const ep of eps) {
        stmt.run(ep.guid, ep.feedUrl, userId, ep.title, ep.pubDate, ep.duration, ep.audioUrl, ep.description);
      }
    });
    insertMany(episodes);

    return { url, ok: true };
  } catch (err: any) {
    return { url, ok: false, error: err?.message || 'Failed to fetch feed' };
  }
}

// Refresh all feeds for the authenticated user in a single request
router.post('/refresh-feeds', async (req, res) => {
  const userId = req.session.userId!;
  const db = getDb();
  const feeds = db.prepare('SELECT url FROM feeds WHERE user_id = ?').all(userId) as { url: string }[];

  const results: FeedResult[] = [];
  for (const feed of feeds) {
    results.push(await refreshFeedUrl(feed.url, userId));
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const errors: Record<string, string> = {};
  for (const r of results) {
    if (!r.ok && r.error) errors[r.url] = r.error;
  }

  res.json({ succeeded, failed, errors });
});

// Auto-refresh all feeds for all users (called by the scheduled job)
export async function refreshAllFeedsForAllUsers(): Promise<void> {
  const db = getDb();
  const userFeeds = db.prepare('SELECT DISTINCT user_id, url FROM feeds').all() as { user_id: number; url: string }[];

  // Group by user
  const byUser = new Map<number, string[]>();
  for (const row of userFeeds) {
    const urls = byUser.get(row.user_id) || [];
    urls.push(row.url);
    byUser.set(row.user_id, urls);
  }

  for (const [userId, urls] of byUser) {
    let succeeded = 0;
    let failed = 0;
    for (const url of urls) {
      const result = await refreshFeedUrl(url, userId);
      if (result.ok) succeeded++;
      else failed++;
    }
    console.log(`Auto-refresh: user ${userId} — ${succeeded} succeeded, ${failed} failed (${urls.length} feeds)`);
  }
}

export default router;
