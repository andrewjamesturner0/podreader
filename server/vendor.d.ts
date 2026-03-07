declare module 'better-sqlite3-session-store' {
  import session from 'express-session';
  import Database from 'better-sqlite3';

  interface StoreOptions {
    client: Database.Database;
    expired?: {
      clear?: boolean;
      intervalMs?: number;
    };
  }

  function BetterSqlite3SessionStore(
    expressSession: typeof session
  ): new (options: StoreOptions) => session.Store;

  export = BetterSqlite3SessionStore;
}
