import { serveStatic } from 'hono/bun';
import { dirname, join } from 'node:path';
import { createApp } from './app';
import { openDb } from './db';

// Bun reads .env automatically.
const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 8 characters) in .env. See .env.example.');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DATABASE_PATH ?? 'data/feedbacker.db';
const db = openDb(dbPath);
const uploadDir = join(dirname(dbPath), 'uploads'); // next to the database, so one volume holds all data
// shortcut: a new secret on each start, so a restart signs the owner out. Store it if that gets annoying.
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

const app = createApp({ db, username: ADMIN_USERNAME, password: ADMIN_PASSWORD, secret, uploadDir });
app.use('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' })); // client routes: / (landing), /admin/..., /f/:id

Bun.serve({ port, fetch: app.fetch });
console.log(`Feedbacker is running on http://localhost:${port}`);
