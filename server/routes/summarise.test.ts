// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, resetDb, authenticatedAgent } from '../test/helpers.js';
import type { Express } from 'express';
import type supertest from 'supertest';

let app: Express;
let agent: supertest.SuperAgentTest;

beforeEach(async () => {
  resetDb();
  app = createTestApp();
  agent = await authenticatedAgent(app);
});

describe('POST /api/summarise — input validation', () => {
  it('returns 400 when transcript is missing', async () => {
    const res = await agent
      .post('/api/summarise')
      .send({ provider: 'openai' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing transcript/i);
  });

  it('returns 400 when transcript exceeds 500k characters', async () => {
    const res = await agent
      .post('/api/summarise')
      .send({ transcript: 'x'.repeat(500_001), provider: 'openai' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
  });

  it('returns 400 for unknown provider', async () => {
    const res = await agent
      .post('/api/summarise')
      .send({ transcript: 'Hello world', provider: 'google' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown provider/i);
  });

  it('returns 400 for disallowed model', async () => {
    const res = await agent
      .post('/api/summarise')
      .send({ transcript: 'Hello world', provider: 'openai', model: 'gpt-4' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it('returns 400 for disallowed anthropic model', async () => {
    const res = await agent
      .post('/api/summarise')
      .send({ transcript: 'Hello world', provider: 'anthropic', model: 'claude-3-opus-20240229' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it('returns 401 without auth session', async () => {
    const supertest = (await import('supertest')).default;
    const res = await supertest(app)
      .post('/api/summarise')
      .send({ transcript: 'Hello world', provider: 'openai' });

    expect(res.status).toBe(401);
  });
});
