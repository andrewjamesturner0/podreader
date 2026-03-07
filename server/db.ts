import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/var/lib/podreader/podreader.db';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS feeds (
      url TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      last_fetched_at INTEGER,
      PRIMARY KEY (url, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS episodes (
      guid TEXT NOT NULL,
      feed_url TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      pub_date TEXT NOT NULL DEFAULT '',
      duration TEXT NOT NULL DEFAULT '',
      audio_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (guid, user_id),
      FOREIGN KEY (feed_url, user_id) REFERENCES feeds(url, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_episodes_feed ON episodes(feed_url, user_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_pubdate ON episodes(pub_date);

    CREATE TABLE IF NOT EXISTS transcripts (
      episode_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (episode_id, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      episode_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      markdown TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (episode_id, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (key, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}
