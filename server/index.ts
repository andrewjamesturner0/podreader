import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import BetterSqlite3SessionStore from 'better-sqlite3-session-store';
import proxyRoutes from './routes/proxy.js';
import transcribeRoutes from './routes/transcribe.js';
import summariseRoutes from './routes/summarise.js';
import localLlmRoutes from './routes/localLlm.js';
import localWhisperRoutes from './routes/localWhisper.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import youtubeRoutes from './routes/youtube.js';
import refreshFeedsRoutes, { refreshAllFeedsForAllUsers } from './routes/refreshFeeds.js';
import { stop as stopOllama } from './ollama.js';
import { stop as stopWhisper } from './whisperCpp.js';
import { getDb, closeDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Trust the first proxy (Nginx) so express-rate-limit and req.ip work correctly
app.set('trust proxy', 1);

const isDev = process.env.NODE_ENV === 'development';

// Fix #7: Security headers
// Use useDefaults: false to avoid upgrade-insecure-requests (app runs over plain HTTP)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'base-uri': ["'self'"],
      'font-src': ["'self'", 'https:', 'data:'],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'"],
      'img-src': ["'self'", 'data:'],
      'object-src': ["'none'"],
      'script-src': ["'self'"],
      'script-src-attr': ["'none'"],
      // Only allow unsafe-inline in development (Vite HMR needs it)
      'style-src': isDev ? ["'self'", 'https:', "'unsafe-inline'"] : ["'self'"],
    },
  },
  // HSTS: enabled when ENABLE_HSTS env var is set or behind HTTPS proxy
  hsts: process.env.ENABLE_HSTS === 'true'
    ? { maxAge: 63072000, includeSubDomains: true, preload: true }
    : false,
}));

// Fix #4: Restrict CORS origins
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3001'];
app.use(cors({ origin: corsOrigin, credentials: true }));

// Fix #8: Reduced JSON body limit (was 50mb)
app.use(express.json({ limit: '5mb' }));

// Session middleware (SQLite-backed)
const SqliteStore = BetterSqlite3SessionStore(session);
const sessionSecret = process.env.SESSION_SECRET || (isDev ? 'dev-secret-change-me' : '');
if (!sessionSecret) {
  console.error('FATAL: SESSION_SECRET environment variable is required in production');
  process.exit(1);
}
app.use(session({
  store: new SqliteStore({ client: getDb(), expired: { clear: true, intervalMs: 3600_000 } }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // LAN-only app served over HTTP; set to true if serving over HTTPS
  },
}));

// Allow disabling rate limits for E2E testing
const rateLimitDisabled = process.env.RATE_LIMIT_DISABLED === '1';

// Fix #6: General rate limiting — 100 requests per minute per IP
if (!rateLimitDisabled) {
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
  app.use('/api', generalLimiter);

  // Fix #6: Stricter rate limits for expensive endpoints
  // These endpoints are behind session auth, so userId is always available
  const transcribeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.session?.userId?.toString() || 'unknown',
    message: { error: 'Transcription rate limit exceeded. Please try again later.' },
  });
  app.use('/api/transcribe', transcribeLimiter);
  app.use('/api/youtube/transcript', transcribeLimiter);

  const summariseLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.session?.userId?.toString() || 'unknown',
    message: { error: 'Summarisation rate limit exceeded. Please try again later.' },
  });
  app.use('/api/summarise', summariseLimiter);

  // Rate limit on auth endpoints to prevent brute-force
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts. Please try again later.' },
  });
  app.use('/api/auth', authLimiter);
}

// Auth routes (must be before session-check middleware)
app.use('/api', authRoutes);

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Session auth middleware — all /api/* except health and auth require login
app.use('/api', (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }
  next();
});

// API routes (all require session auth)
app.use('/api', proxyRoutes);
app.use('/api', transcribeRoutes);
app.use('/api', summariseRoutes);
app.use('/api', localLlmRoutes);
app.use('/api', localWhisperRoutes);
app.use('/api', youtubeRoutes);
app.use('/api', dataRoutes);
app.use('/api', refreshFeedsRoutes);

// In production, serve built frontend
// Fix #15: Cache-control headers on static assets
const distPath = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distPath, { maxAge: '1d' }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Auto-refresh all feeds every 12 hours
const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const autoRefreshTimer = setInterval(() => {
  console.log('Starting scheduled feed refresh...');
  refreshAllFeedsForAllUsers().catch(err => {
    console.error('Scheduled feed refresh failed:', err);
  });
}, TWELVE_HOURS);

async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  clearInterval(autoRefreshTimer);
  await stopOllama();
  await stopWhisper();
  closeDb();
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
