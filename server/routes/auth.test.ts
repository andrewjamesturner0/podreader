// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createTestApp, resetDb } from '../test/helpers.js';
import type { Express } from 'express';

let app: Express;

beforeEach(() => {
  resetDb();
  app = createTestApp();
});

describe('POST /api/auth/register', () => {
  it('registers a new user and returns ok + username', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, username: 'alice' });
  });

  it('sets a session cookie on successful registration', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'password123' });

    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects password shorter than 8 characters', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/);
  });

  it('rejects username shorter than 2 characters', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ username: 'a', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2-32 characters/);
  });

  it('rejects username longer than 32 characters', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ username: 'a'.repeat(33), password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2-32 characters/);
  });

  it('rejects missing username or password', async () => {
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ username: 'alice' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 409 for duplicate username', async () => {
    await supertest(app)
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'password123' });

    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'differentpass1' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/taken/i);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    // Register a user first
    await supertest(app)
      .post('/api/auth/register')
      .send({ username: 'bob', password: 'password123' });
  });

  it('logs in with valid credentials', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, username: 'bob' });
  });

  it('rejects wrong password', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects non-existent username', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects missing fields', async () => {
    const res = await supertest(app)
      .post('/api/auth/login')
      .send({ username: 'bob' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 when not logged in', async () => {
    const res = await supertest(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not logged in/i);
  });

  it('returns username when logged in via session', async () => {
    const agent = supertest.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ username: 'carol', password: 'password123' });

    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'carol' });
  });
});

describe('POST /api/auth/logout', () => {
  it('logs out and destroys session', async () => {
    const agent = supertest.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ username: 'dave', password: 'password123' });

    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({ ok: true });

    // Session should be gone — /auth/me returns 401
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(401);
  });
});
