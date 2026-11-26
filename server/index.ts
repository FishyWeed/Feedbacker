import { serveStatic } from 'hono/bun';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
const dataDir = dirname(dbPath);
const uploadDir = join(dataDir, 'uploads'); // next to the database, so one volume holds all data

// The cookie-signing secret is kept next to the database (owner-only file), so a restart or a redeploy does not
// sign the owner out. The password is part of the key: changing ADMIN_PASSWORD signs every session out.
const secretFile = join(dataDir, 'session.secret');
if (!existsSync(secretFile)) writeFileSync(secretFile, Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'), { mode: 0o600 });
const secret = `${readFileSync(secretFile, 'utf8').trim()}:${ADMIN_PASSWORD}`;

const app = createApp({ db, username: ADMIN_USERNAME, password: ADMIN_PASSWORD, secret, uploadDir });
app.use('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' })); // client routes: / (landing), /admin/..., /f/:id

Bun.serve({ port, fetch: app.fetch });
console.log(`Feedbacker is running on http://localhost:${port}`);
