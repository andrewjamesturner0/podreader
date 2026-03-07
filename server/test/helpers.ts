// IMPORTANT: Set env vars at top level. ESM hoists imports, so these run
// AFTER static imports evaluate. We use dynamic imports below to ensure
// db.ts sees the correct DB_PATH when it first loads.
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

import express, { type Express } from 'express';
import session from 'express-session';
import supertest from 'supertest';

// Dynamic imports to ensure process.env.DB_PATH is set BEFORE db.ts evaluates
// its module-level `const DB_PATH = process.env.DB_PATH || ...`
const { default: authRoutes } = await import('../routes/auth.js');
const { default: dataRoutes } = await import('../routes/data.js');
const { default: summariseRoutes } = await import('../routes/summarise.js');
const { getDb, closeDb } = await import('../db.js');

export function createTestApp(): Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Simple in-memory session (no SQLite session store — avoids coupling to better-sqlite3-session-store)
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    }),
  );

  // Auth routes (before auth middleware, same as production)
  app.use('/api', authRoutes);

  // Health check (no auth required)
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  // Session auth middleware — mirrors production server/index.ts
  app.use('/api', (req, res, next) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Not logged in' });
      return;
    }
    next();
  });

  // Protected routes
  app.use('/api', summariseRoutes);
  app.use('/api', dataRoutes);

  return app;
}

/**
 * Close the current DB connection so the next getDb() call creates a fresh :memory: database.
 * Call this in beforeEach() for test isolation.
 */
export function resetDb(): void {
  closeDb();
}

/**
 * Create an authenticated supertest agent (registers a new user and retains the session cookie).
 */
export async function authenticatedAgent(
  app: Express,
  username = 'testuser',
  password = 'password123',
) {
  const agent = supertest.agent(app);
  await agent
    .post('/api/auth/register')
    .send({ username, password })
    .expect(200);
  return agent;
}

export { getDb, closeDb };
