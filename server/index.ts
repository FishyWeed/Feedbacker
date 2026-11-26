import { serveStatic } from 'hono/bun';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createApp } from './app';
import { openDb } from './db';

// Bun reads .env automatically.
// MODE=single (default): one owner from ADMIN_USERNAME and ADMIN_PASSWORD, for self-hosting.
// MODE=hosted: a public website where anyone signs up with an email and a password.
const env = process.env;
const mode = env.MODE === 'hosted' ? 'hosted' : 'single';
if (env.MODE && env.MODE !== mode) {
  console.error(`MODE must be "single" or "hosted", not "${env.MODE}".`);
  process.exit(1);
}
const { ADMIN_USERNAME, ADMIN_PASSWORD } = env;
if (mode === 'single' && (!ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8)) {
  console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 8 characters) in .env. See .env.example.');
  process.exit(1);
}
const uploadLimitMb = Number(env.UPLOAD_LIMIT_MB ?? 100);
if (!(uploadLimitMb > 0)) {
  console.error('UPLOAD_LIMIT_MB must be a number above 0.');
  process.exit(1);
}

const port = Number(env.PORT ?? 4200);
const dbPath = env.DATABASE_PATH ?? 'data/feedbacker.db';
const db = openDb(dbPath);
const dataDir = dirname(dbPath);
const uploadDir = join(dataDir, 'uploads'); // next to the database, so one volume holds all data

// The cookie-signing secret is kept next to the database (owner-only file), so a restart or a redeploy does not
// sign anyone out. In single mode the password is part of the key: changing ADMIN_PASSWORD signs every session out.
const secretFile = join(dataDir, 'session.secret');
if (!existsSync(secretFile)) writeFileSync(secretFile, Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'), { mode: 0o600 });
const secret = `${readFileSync(secretFile, 'utf8').trim()}:${mode === 'single' ? ADMIN_PASSWORD : 'hosted'}`;

const app = createApp({
  db, secret, uploadDir, mode, username: ADMIN_USERNAME, password: ADMIN_PASSWORD,
  adminEmail: env.ADMIN_EMAIL, uploadLimitMb, clientIpHeader: env.CLIENT_IP_HEADER,
});
app.use('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' })); // client routes: / (landing), /admin/..., /f/:id

Bun.serve({ port, fetch: app.fetch });
console.log(`Feedbacker is running on http://localhost:${port} (${mode === 'hosted' ? 'hosted: open sign-up' : 'single owner'})`);
if (mode === 'hosted' && !env.CLIENT_IP_HEADER) console.warn('CLIENT_IP_HEADER is not set: behind a proxy, sign-in and sign-up limits count all visitors as one.');
