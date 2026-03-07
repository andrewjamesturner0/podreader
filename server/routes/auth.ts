import { Router } from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../db.js';

const router = Router();
const SALT_ROUNDS = 10;

router.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (username.length < 2 || username.length > 32) {
      res.status(400).json({ error: 'Username must be 2-32 characters' });
      return;
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      res.status(409).json({ error: 'Username taken' });
      return;
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    req.session.userId = result.lastInsertRowid as number;
    req.session.username = username;
    res.json({ ok: true, username });
  } catch (err: any) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const db = getDb();
    const user = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as { id: number; password_hash: string } | undefined;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    req.session.userId = user.id;
    req.session.username = username;
    res.json({ ok: true, username });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/auth/me', (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }
  res.json({ username: req.session.username });
});

export default router;
