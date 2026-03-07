// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createTestApp, resetDb, authenticatedAgent } from '../test/helpers.js';
import type { Express } from 'express';

let app: Express;

beforeEach(() => {
  resetDb();
  app = createTestApp();
});

// ── Auth required ────────────────────────────────────────────────────────

describe('Auth middleware', () => {
  it('returns 401 for unauthenticated requests to /api/data/feeds', async () => {
    const res = await supertest(app).get('/api/data/feeds');
    expect(res.status).toBe(401);
  });

  it('returns 401 for unauthenticated PUT /api/data/feeds', async () => {
    const res = await supertest(app)
      .put('/api/data/feeds')
      .send({ url: 'https://example.com/feed.xml', title: 'Test' });
    expect(res.status).toBe(401);
  });
});

// ── Feeds ────────────────────────────────────────────────────────────────

describe('Feeds CRUD', () => {
  it('PUT creates a feed, GET retrieves it', async () => {
    const agent = await authenticatedAgent(app);

    await agent
      .put('/api/data/feeds')
      .send({
        url: 'https://example.com/feed.xml',
        title: 'My Podcast',
        description: 'A great podcast',
        imageUrl: 'https://example.com/image.png',
      })
      .expect(200);

    const res = await agent.get('/api/data/feeds').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      url: 'https://example.com/feed.xml',
      title: 'My Podcast',
      description: 'A great podcast',
      imageUrl: 'https://example.com/image.png',
    });
  });

  it('PUT upserts an existing feed', async () => {
    const agent = await authenticatedAgent(app);

    await agent
      .put('/api/data/feeds')
      .send({ url: 'https://example.com/feed.xml', title: 'Version 1' });
    await agent
      .put('/api/data/feeds')
      .send({ url: 'https://example.com/feed.xml', title: 'Version 2' });

    const res = await agent.get('/api/data/feeds');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Version 2');
  });

  it('DELETE removes a feed and its episodes', async () => {
    const agent = await authenticatedAgent(app);

    await agent
      .put('/api/data/feeds')
      .send({ url: 'https://example.com/feed.xml', title: 'Doomed' });

    // Add an episode too
    await agent
      .put('/api/data/episodes')
      .send([
        {
          guid: 'ep1',
          feedUrl: 'https://example.com/feed.xml',
          title: 'Episode 1',
          pubDate: '2024-01-01',
          duration: '30:00',
          audioUrl: 'https://example.com/ep1.mp3',
          description: 'First episode',
        },
      ]);

    await agent
      .delete('/api/data/feeds')
      .send({ url: 'https://example.com/feed.xml' })
      .expect(200);

    const feeds = await agent.get('/api/data/feeds');
    expect(feeds.body).toHaveLength(0);

    const episodes = await agent.get('/api/data/episodes');
    expect(episodes.body).toHaveLength(0);
  });

  it('PUT feed with missing url returns 400', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent
      .put('/api/data/feeds')
      .send({ title: 'No URL' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/url/i);
  });

  it('PUT feed with invalid url returns 400', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent
      .put('/api/data/feeds')
      .send({ url: 'not-a-url', title: 'Bad' });
    expect(res.status).toBe(400);
  });
});

// ── Episodes ─────────────────────────────────────────────────────────────

describe('Episodes CRUD', () => {
  let agent: supertest.SuperAgentTest;

  beforeEach(async () => {
    agent = await authenticatedAgent(app);
    // Create a feed first (foreign key)
    await agent
      .put('/api/data/feeds')
      .send({ url: 'https://example.com/feed.xml', title: 'Test Feed' });
  });

  it('PUT episodes (array) and GET all', async () => {
    await agent
      .put('/api/data/episodes')
      .send([
        {
          guid: 'ep1',
          feedUrl: 'https://example.com/feed.xml',
          title: 'Episode 1',
          pubDate: '2024-01-01',
          duration: '30:00',
          audioUrl: 'https://example.com/ep1.mp3',
          description: 'First',
        },
        {
          guid: 'ep2',
          feedUrl: 'https://example.com/feed.xml',
          title: 'Episode 2',
          pubDate: '2024-01-02',
          duration: '45:00',
          audioUrl: 'https://example.com/ep2.mp3',
          description: 'Second',
        },
      ])
      .expect(200);

    const res = await agent.get('/api/data/episodes').expect(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET episodes filtered by feedUrl', async () => {
    // Create a second feed
    await agent
      .put('/api/data/feeds')
      .send({ url: 'https://example.com/feed2.xml', title: 'Feed 2' });

    await agent.put('/api/data/episodes').send([
      {
        guid: 'ep1',
        feedUrl: 'https://example.com/feed.xml',
        title: 'Episode 1',
        pubDate: '2024-01-01',
        duration: '30:00',
        audioUrl: '',
        description: '',
      },
      {
        guid: 'ep2',
        feedUrl: 'https://example.com/feed2.xml',
        title: 'Episode 2',
        pubDate: '2024-01-02',
        duration: '45:00',
        audioUrl: '',
        description: '',
      },
    ]);

    const res = await agent
      .get('/api/data/episodes')
      .query({ feedUrl: 'https://example.com/feed.xml' })
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].guid).toBe('ep1');
  });

  it('PUT episodes with non-array body returns 400', async () => {
    const res = await agent
      .put('/api/data/episodes')
      .send({ guid: 'ep1', feedUrl: 'https://example.com/feed.xml' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/array/i);
  });
});

// ── Transcripts ──────────────────────────────────────────────────────────

describe('Transcripts CRUD', () => {
  it('PUT and GET a transcript', async () => {
    const agent = await authenticatedAgent(app);

    await agent
      .put('/api/data/transcripts')
      .send({
        episodeId: 'ep1',
        text: 'Hello world this is a transcript.',
        createdAt: 1700000000,
        model: 'whisper-1',
      })
      .expect(200);

    const res = await agent
      .get('/api/data/transcripts/ep1')
      .expect(200);

    expect(res.body).toMatchObject({
      episodeId: 'ep1',
      text: 'Hello world this is a transcript.',
      model: 'whisper-1',
    });
  });

  it('GET non-existent transcript returns null', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent.get('/api/data/transcripts/nonexistent').expect(200);
    expect(res.body).toBeNull();
  });

  it('PUT transcript with missing episodeId returns 400', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent
      .put('/api/data/transcripts')
      .send({ text: 'Some text', createdAt: 1700000000 });
    expect(res.status).toBe(400);
  });

  it('PUT transcript with missing text returns 400', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent
      .put('/api/data/transcripts')
      .send({ episodeId: 'ep1', createdAt: 1700000000 });
    expect(res.status).toBe(400);
  });
});

// ── Summaries ────────────────────────────────────────────────────────────

describe('Summaries CRUD', () => {
  it('PUT and GET a summary', async () => {
    const agent = await authenticatedAgent(app);

    await agent
      .put('/api/data/summaries')
      .send({
        episodeId: 'ep1',
        markdown: '# Summary\n\nGreat episode.',
        provider: 'openai',
        model: 'gpt-4o-mini',
        createdAt: 1700000000,
      })
      .expect(200);

    const res = await agent
      .get('/api/data/summaries/ep1')
      .expect(200);

    expect(res.body).toMatchObject({
      episodeId: 'ep1',
      markdown: '# Summary\n\nGreat episode.',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('GET non-existent summary returns null', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent.get('/api/data/summaries/nonexistent').expect(200);
    expect(res.body).toBeNull();
  });

  it('PUT summary with missing episodeId returns 400', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent
      .put('/api/data/summaries')
      .send({ markdown: '# Summary', createdAt: 1700000000 });
    expect(res.status).toBe(400);
  });

  it('PUT summary with missing markdown returns 400', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent
      .put('/api/data/summaries')
      .send({ episodeId: 'ep1', createdAt: 1700000000 });
    expect(res.status).toBe(400);
  });
});

// ── Settings ─────────────────────────────────────────────────────────────

describe('Settings CRUD', () => {
  it('PUT and GET a setting', async () => {
    const agent = await authenticatedAgent(app);

    await agent
      .put('/api/data/settings')
      .send({ key: 'theme', value: 'dark' })
      .expect(200);

    const res = await agent
      .get('/api/data/settings/theme')
      .expect(200);

    expect(res.body).toEqual({ value: 'dark' });
  });

  it('GET non-existent setting returns null value', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent
      .get('/api/data/settings/nonexistent')
      .expect(200);
    expect(res.body).toEqual({ value: null });
  });

  it('PUT setting upserts existing key', async () => {
    const agent = await authenticatedAgent(app);

    await agent.put('/api/data/settings').send({ key: 'theme', value: 'light' });
    await agent.put('/api/data/settings').send({ key: 'theme', value: 'dark' });

    const res = await agent.get('/api/data/settings/theme');
    expect(res.body).toEqual({ value: 'dark' });
  });

  it('PUT setting with invalid key (special chars) returns 400', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent
      .put('/api/data/settings')
      .send({ key: 'bad-key!', value: 'whatever' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/key/i);
  });

  it('PUT setting with missing value returns 400', async () => {
    const agent = await authenticatedAgent(app);
    const res = await agent
      .put('/api/data/settings')
      .send({ key: 'theme' });
    expect(res.status).toBe(400);
  });
});

// ── Multi-user isolation ─────────────────────────────────────────────────

describe('Multi-user data isolation', () => {
  it('user1 cannot see user2 feeds', async () => {
    const agent1 = await authenticatedAgent(app, 'user1', 'password123');
    const agent2 = await authenticatedAgent(app, 'user2', 'password123');

    await agent1
      .put('/api/data/feeds')
      .send({ url: 'https://example.com/feed1.xml', title: 'User1 Feed' });

    await agent2
      .put('/api/data/feeds')
      .send({ url: 'https://example.com/feed2.xml', title: 'User2 Feed' });

    const res1 = await agent1.get('/api/data/feeds');
    expect(res1.body).toHaveLength(1);
    expect(res1.body[0].title).toBe('User1 Feed');

    const res2 = await agent2.get('/api/data/feeds');
    expect(res2.body).toHaveLength(1);
    expect(res2.body[0].title).toBe('User2 Feed');
  });

  it('user1 cannot see user2 transcripts', async () => {
    const agent1 = await authenticatedAgent(app, 'user1', 'password123');
    const agent2 = await authenticatedAgent(app, 'user2', 'password123');

    await agent1
      .put('/api/data/transcripts')
      .send({ episodeId: 'ep1', text: 'User1 transcript', createdAt: 1700000000 });

    const res = await agent2.get('/api/data/transcripts/ep1');
    expect(res.body).toBeNull();
  });

  it('user1 cannot see user2 summaries', async () => {
    const agent1 = await authenticatedAgent(app, 'user1', 'password123');
    const agent2 = await authenticatedAgent(app, 'user2', 'password123');

    await agent1
      .put('/api/data/summaries')
      .send({ episodeId: 'ep1', markdown: '# User1', createdAt: 1700000000 });

    const res = await agent2.get('/api/data/summaries/ep1');
    expect(res.body).toBeNull();
  });

  it('user1 cannot see user2 settings', async () => {
    const agent1 = await authenticatedAgent(app, 'user1', 'password123');
    const agent2 = await authenticatedAgent(app, 'user2', 'password123');

    await agent1.put('/api/data/settings').send({ key: 'theme', value: 'dark' });

    const res = await agent2.get('/api/data/settings/theme');
    expect(res.body).toEqual({ value: null });
  });
});
