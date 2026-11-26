import { serveStatic } from 'hono/bun';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createApp } from './app';
import { openDb } from './db';

// Bun reads .env automatically. Every setting is optional; see .env.example.
const env = process.env;
if (env.SIGNUP && !['open', 'closed'].includes(env.SIGNUP)) {
  console.error(`SIGNUP must be "open" or "closed", not "${env.SIGNUP}".`);
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
// sign anyone out.
const secretFile = join(dataDir, 'session.secret');
if (!existsSync(secretFile)) writeFileSync(secretFile, Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'), { mode: 0o600 });
const secret = readFileSync(secretFile, 'utf8').trim();

const app = createApp({
  db, secret, uploadDir, signup: env.SIGNUP !== 'closed',
  adminEmail: env.ADMIN_EMAIL, uploadLimitMb, clientIpHeader: env.CLIENT_IP_HEADER,
});
app.use('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' })); // client routes: / (landing), /admin/..., /f/:id

Bun.serve({ port, fetch: app.fetch });
console.log(`Feedbacker is running on http://localhost:${port} (sign-up ${env.SIGNUP === 'closed' ? 'closed' : 'open'})`);
// Forms from a version with one owner wait for the ADMIN_EMAIL account (they never go to whoever signs up first).
const old = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM forms WHERE owner = 0').get()!.n;
if (old && !env.ADMIN_EMAIL) console.warn(`${old} form(s) from an older version have no account yet. Set ADMIN_EMAIL to your email, restart, then sign up or sign in with it.`);
