import { Router } from 'express';
import { getDb } from '../db.js';
import { validateString, validateUrl, validateArray } from '../utils/validation.js';

const router = Router();

// ── Feeds ──────────────────────────────────────────────────────────────

router.get('/data/feeds', (req, res) => {
  const userId = req.session.userId!;
  const feeds = getDb()
    .prepare('SELECT url, title, description, image_url AS imageUrl, last_fetched_at AS lastFetchedAt FROM feeds WHERE user_id = ?')
    .all(userId);
  res.json(feeds);
});

router.put('/data/feeds', (req, res) => {
  const userId = req.session.userId!;
  const { url, title, description, imageUrl, lastFetchedAt } = req.body;
  const validUrl = validateUrl(url, 2048);
  if (!validUrl) { res.status(400).json({ error: 'Invalid or missing url' }); return; }
  const validTitle = validateString(title, 1000) ?? '';
  const validDescription = validateString(description, 1000) ?? '';
  const validImageUrl = imageUrl ? (validateUrl(imageUrl, 2048) ?? '') : '';
  getDb()
    .prepare(`INSERT INTO feeds (url, user_id, title, description, image_url, last_fetched_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(url, user_id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                image_url = excluded.image_url,
                last_fetched_at = excluded.last_fetched_at`)
    .run(validUrl, userId, validTitle, validDescription, validImageUrl, lastFetchedAt ?? null);
  res.json({ ok: true });
});

router.delete('/data/feeds', (req, res) => {
  const userId = req.session.userId!;
  const { url } = req.body;
  const validUrl = validateUrl(url, 2048);
  if (!validUrl) { res.status(400).json({ error: 'Invalid or missing url' }); return; }
  const db = getDb();
  db.prepare('DELETE FROM episodes WHERE feed_url = ? AND user_id = ?').run(validUrl, userId);
  db.prepare('DELETE FROM feeds WHERE url = ? AND user_id = ?').run(validUrl, userId);
  res.json({ ok: true });
});

// ── Episodes ───────────────────────────────────────────────────────────

router.get('/data/episodes', (req, res) => {
  const userId = req.session.userId!;
  const feedUrl = req.query.feedUrl as string | undefined;
  let episodes;
  if (feedUrl) {
    episodes = getDb()
      .prepare('SELECT guid, feed_url AS feedUrl, title, pub_date AS pubDate, duration, audio_url AS audioUrl, description FROM episodes WHERE feed_url = ? AND user_id = ? ORDER BY pub_date DESC')
      .all(feedUrl, userId);
  } else {
    episodes = getDb()
      .prepare('SELECT guid, feed_url AS feedUrl, title, pub_date AS pubDate, duration, audio_url AS audioUrl, description FROM episodes WHERE user_id = ? ORDER BY pub_date DESC')
      .all(userId);
  }
  res.json(episodes);
});

router.get('/data/episodes/summarised', (req, res) => {
  const userId = req.session.userId!;
  const episodes = getDb()
    .prepare(`SELECT e.guid, e.feed_url AS feedUrl, e.title, e.pub_date AS pubDate, e.duration, e.audio_url AS audioUrl, e.description
              FROM episodes e
              JOIN summaries s ON s.episode_id = e.guid AND s.user_id = e.user_id
              WHERE e.user_id = ?
              ORDER BY e.pub_date DESC`)
    .all(userId);
  res.json(episodes);
});

router.put('/data/episodes', (req, res) => {
  const userId = req.session.userId!;
  const validArray = validateArray(req.body, 5000);
  if (!validArray) { res.status(400).json({ error: 'Body must be an array with at most 5000 items' }); return; }
  const episodes = validArray as Array<{ guid: string; feedUrl: string; title: string; pubDate: string; duration: string; audioUrl: string; description: string }>;
  for (const ep of episodes) {
    ep.guid = validateString(ep.guid, 500) ?? '';
    ep.feedUrl = validateUrl(ep.feedUrl, 2048) ?? '';
    ep.title = validateString(ep.title, 1000) ?? '';
    ep.pubDate = validateString(ep.pubDate, 100) ?? '';
    ep.duration = validateString(ep.duration, 100) ?? '';
    ep.audioUrl = ep.audioUrl ? (validateUrl(ep.audioUrl, 2048) ?? '') : '';
    ep.description = validateString(ep.description, 10000) ?? '';
  }
  const db = getDb();
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
      stmt.run(ep.guid, ep.feedUrl, userId, ep.title || '', ep.pubDate || '', ep.duration || '', ep.audioUrl || '', ep.description || '');
    }
  });
  insertMany(episodes);
  res.json({ ok: true });
});

// ── Episode statuses (batch) ──────────────────────────────────────────

router.get('/data/episodes/statuses', (req, res) => {
  const userId = req.session.userId!;
  const db = getDb();
  const transcribed = db.prepare('SELECT episode_id FROM transcripts WHERE user_id = ?').all(userId) as { episode_id: string }[];
  const summarised = db.prepare('SELECT episode_id FROM summaries WHERE user_id = ?').all(userId) as { episode_id: string }[];
  const statuses: Record<string, 'transcribed' | 'summarised'> = {};
  for (const row of transcribed) statuses[row.episode_id] = 'transcribed';
  for (const row of summarised) statuses[row.episode_id] = 'summarised'; // overwrites transcribed
  res.json(statuses);
});

// ── Transcripts ────────────────────────────────────────────────────────

router.get('/data/transcripts/:episodeId', (req, res) => {
  const userId = req.session.userId!;
  const row = getDb()
    .prepare('SELECT episode_id AS episodeId, text, created_at AS createdAt, model FROM transcripts WHERE episode_id = ? AND user_id = ?')
    .get(req.params.episodeId, userId);
  res.json(row || null);
});

router.put('/data/transcripts', (req, res) => {
  const userId = req.session.userId!;
  const { episodeId, text, createdAt, model } = req.body;
  const validEpisodeId = validateString(episodeId, 500);
  const validText = validateString(text, 2_000_000);
  if (!validEpisodeId || !validText) { res.status(400).json({ error: 'Missing or invalid episodeId or text' }); return; }
  getDb()
    .prepare(`INSERT INTO transcripts (episode_id, user_id, text, created_at, model)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(episode_id, user_id) DO UPDATE SET
                text = excluded.text,
                created_at = excluded.created_at,
                model = excluded.model`)
    .run(validEpisodeId, userId, validText, createdAt, model || '');
  res.json({ ok: true });
});

// ── Summaries ──────────────────────────────────────────────────────────

router.get('/data/summaries/:episodeId', (req, res) => {
  const userId = req.session.userId!;
  const row = getDb()
    .prepare('SELECT episode_id AS episodeId, markdown, provider, model, created_at AS createdAt FROM summaries WHERE episode_id = ? AND user_id = ?')
    .get(req.params.episodeId, userId);
  res.json(row || null);
});

router.put('/data/summaries', (req, res) => {
  const userId = req.session.userId!;
  const { episodeId, markdown, provider, model, createdAt } = req.body;
  const validEpisodeId = validateString(episodeId, 500);
  const validMarkdown = validateString(markdown, 500_000);
  if (!validEpisodeId || !validMarkdown) { res.status(400).json({ error: 'Missing or invalid episodeId or markdown' }); return; }
  getDb()
    .prepare(`INSERT INTO summaries (episode_id, user_id, markdown, provider, model, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(episode_id, user_id) DO UPDATE SET
                markdown = excluded.markdown,
                provider = excluded.provider,
                model = excluded.model,
                created_at = excluded.created_at`)
    .run(validEpisodeId, userId, validMarkdown, provider || '', model || '', createdAt);
  res.json({ ok: true });
});

// ── Settings ───────────────────────────────────────────────────────────

router.get('/data/settings/:key', (req, res) => {
  const userId = req.session.userId!;
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ? AND user_id = ?')
    .get(req.params.key, userId) as { value: string } | undefined;
  res.json({ value: row?.value ?? null });
});

router.put('/data/settings', (req, res) => {
  const userId = req.session.userId!;
  const { key, value } = req.body;
  const validKey = validateString(key, 64);
  if (!validKey || !/^[a-zA-Z0-9_]+$/.test(validKey)) { res.status(400).json({ error: 'Invalid or missing key' }); return; }
  const validValue = validateString(value, 10_000);
  if (!validValue) { res.status(400).json({ error: 'Invalid or missing value' }); return; }
  getDb()
    .prepare(`INSERT INTO settings (key, user_id, value)
              VALUES (?, ?, ?)
              ON CONFLICT(key, user_id) DO UPDATE SET value = excluded.value`)
    .run(validKey, userId, validValue);
  res.json({ ok: true });
});

export default router;
