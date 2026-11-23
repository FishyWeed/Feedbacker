import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      doc TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      answers TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS responses_by_form ON responses(form_id, created_at);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Drafts and publishing: `doc` is the saved draft, `published` is what the live link shows.
  const cols = db.query<{ name: string }, []>('PRAGMA table_info(forms)').all().map((c) => c.name);
  if (!cols.includes('published')) {
    db.exec('ALTER TABLE forms ADD COLUMN published TEXT; ALTER TABLE forms ADD COLUMN published_at INTEGER;');
    // Forms from before publishing existed were live already; keep their links working.
    db.exec('UPDATE forms SET published = doc, published_at = updated_at');
  }
  return db;
}
