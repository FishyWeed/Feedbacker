import type { Database } from 'bun:sqlite';
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from 'hono/bun';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { secureHeaders } from 'hono/secure-headers';
import { checkAnswers } from '../shared/logic';
import { parseDevSettings } from '../shared/devSettings';
import { REPO_SLUG } from '../shared/repo';
import { newForm, parseFormDoc, type FormDoc } from '../shared/schema';

type Options = { db: Database; username: string; password: string; secret: string; uploadDir: string; fetchGitHub?: typeof fetch };

const MB = 1024 * 1024;
const MAX_IMAGE = 5 * MB;
const MAX_VIDEO = 25 * MB;
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
// Check the file's first bytes, not its name or the type the browser claims.
// SVG is not allowed: it can carry scripts.
const MEDIA_TYPES = [
  { ext: 'png', type: 'image/png', max: MAX_IMAGE, test: (b: Uint8Array) => b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' },
  { ext: 'jpg', type: 'image/jpeg', max: MAX_IMAGE, test: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif', type: 'image/gif', max: MAX_IMAGE, test: (b: Uint8Array) => ascii(b, 0, 4) === 'GIF8' },
  { ext: 'webp', type: 'image/webp', max: MAX_IMAGE, test: (b: Uint8Array) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  { ext: 'mp4', type: 'video/mp4', max: MAX_VIDEO, test: (b: Uint8Array) => ascii(b, 4, 8) === 'ftyp' && !ascii(b, 8, 12).startsWith('qt') },
  { ext: 'webm', type: 'video/webm', max: MAX_VIDEO, test: (b: Uint8Array) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

const COOKIE = 'feedbacker_session';
const SESSION_SECONDS = 7 * 24 * 3600;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const sha256 = (s: string) => new Bun.CryptoHasher('sha256').update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));

// 64 symbols, so `byte & 63` has no bias. 10 symbols = 60 random bits.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ALPHABET[b & 63]).join('');

// The socket address cannot be faked, unlike X-Forwarded-For.
const clientIp = (c: Context) => {
  try { return getConnInfo(c).remote.address ?? 'unknown'; } catch { return 'unknown'; }
};
const isHttps = (c: Context) => c.req.url.startsWith('https:') || c.req.header('x-forwarded-proto') === 'https';
const readJson = (c: Context) => c.req.json().catch(() => null);

export function createApp({ db, username, password, secret, uploadDir, fetchGitHub = fetch }: Options) {
  const app = new Hono();
  app.use('*', secureHeaders());
  const tooLarge = (c: Context) => c.json({ error: 'Request is too large.' }, 413);
  const smallBody = bodyLimit({ maxSize: 1024 * 1024, onError: tooLarge });
  app.use('/api/*', (c, next) => (c.req.path === '/api/uploads' ? next() : smallBody(c, next)));

  /** Parse on read too, so forms saved by an older version get defaults for newer fields. */
  const parse = (json: string | null) => {
    if (!json) return null;
    const raw = JSON.parse(json);
    return parseFormDoc(raw) ?? (raw as FormDoc);
  };
  type FormRow = { doc: string; published: string | null; published_at: number | null; updated_at: number };
  const row = (id: string) => db.query<FormRow, [string]>('SELECT doc, published, published_at, updated_at FROM forms WHERE id = ?').get(id);
  /** The saved draft (owner side). */
  const getForm = (id: string) => parse(row(id)?.doc ?? null);
  /** What the live link shows: the last published version, or null if never published. */
  const getPublished = (id: string) => parse(row(id)?.published ?? null);

  // --- Owner sign-in ---
  // shortcut: failed-login counts live in memory and use the socket address. Behind a reverse proxy,
  // all visitors share the proxy's address and so one count. Read the proxy's client-IP header if that matters.
  const fails = new Map<string, { n: number; until: number }>();

  app.post('/api/login', async (c) => {
    const ip = clientIp(c);
    const now = Date.now();
    const f = fails.get(ip);
    if (f && f.until > now && f.n >= MAX_FAILS) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    const body = await readJson(c);
    const u = typeof body?.username === 'string' ? body.username : '';
    const p = typeof body?.password === 'string' ? body.password : '';
    // Check both values every time, so the response time does not show which one was wrong.
    const ok = [same(u, username), same(p, password)].every(Boolean);
    if (!ok) {
      fails.set(ip, { n: (f && f.until > now ? f.n : 0) + 1, until: now + LOCK_MS });
      return c.json({ error: 'Wrong username or password.' }, 401);
    }
    fails.delete(ip);
    await setSignedCookie(c, COOKIE, String(now + SESSION_SECONDS * 1000), secret, {
      httpOnly: true, sameSite: 'Strict', path: '/', maxAge: SESSION_SECONDS, secure: isHttps(c),
    });
    return c.json({ ok: true });
  });

  app.post('/api/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  const owner = createMiddleware(async (c, next) => {
    const expires = await getSignedCookie(c, secret, COOKIE);
    if (!expires || Number(expires) < Date.now()) return c.json({ error: 'Not signed in.' }, 401);
    await next();
  });
  app.use('/api/me', owner);
  app.use('/api/forms', owner);
  app.use('/api/forms/*', owner);
  app.use('/api/uploads', owner);
  app.use('/api/settings', owner);

  app.get('/api/me', (c) => c.json({ ok: true }));

  // --- Owner: dev mode appearance (theme, color mode, fonts) ---
  const getSettings = () => parseDevSettings(JSON.parse(db.query<{ value: string }, []>("SELECT value FROM settings WHERE key = 'dev'").get()?.value ?? 'null'));
  app.get('/api/settings', (c) => c.json(getSettings()));
  // Public: which landing page "/" shows. Only this one value leaves the owner settings.
  app.get('/api/landing', (c) => c.json({ theme: getSettings().landing }));

  // Public: the repo's GitHub star count for the landing page. The server asks GitHub (at most once an hour),
  // so visitors' browsers never contact a third party. null when GitHub can't be reached.
  let stars: { n: number | null; at: number } = { n: null, at: 0 };
  app.get('/api/stars', async (c) => {
    if (Date.now() - stars.at > 3_600_000) {
      try {
        const r = await fetchGitHub(`https://api.github.com/repos/${REPO_SLUG}`, { headers: { 'User-Agent': 'Feedbacker', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(4000) });
        const n = r.ok ? (await r.json()).stargazers_count : null;
        stars = { n: typeof n === 'number' ? n : null, at: Date.now() };
      } catch {
        stars = { n: stars.n, at: Date.now() - 3_300_000 }; // try again in 5 minutes
      }
    }
    return c.json({ stars: stars.n });
  });
  app.put('/api/settings', async (c) => {
    const s = parseDevSettings(await readJson(c));
    db.query("INSERT INTO settings (key, value) VALUES ('dev', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(s));
    return c.json(s);
  });

  // --- Owner: image and video uploads, saved next to the database ---
  // shortcut: files stay when a block, background or form is deleted. Add a cleanup job if disk space matters.
  app.post('/api/uploads', bodyLimit({ maxSize: MAX_VIDEO + 64 * 1024, onError: tooLarge }), async (c) => {
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.file;
    if (!(file instanceof File)) return c.json({ error: 'Choose a file.' }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = MEDIA_TYPES.find((t) => t.test(bytes));
    if (!kind) return c.json({ error: 'Use a PNG, JPEG, GIF or WebP image, or an MP4 or WebM video.' }, 400);
    if (file.size > kind.max) return c.json({ error: `The file must be ${kind.max / MB} MB or smaller.` }, 413);
    const name = `${newId()}${newId()}.${kind.ext}`;
    mkdirSync(uploadDir, { recursive: true });
    await Bun.write(join(uploadDir, name), bytes);
    return c.json({ url: `/uploads/${name}`, type: kind.type }, 201);
  });

  // Public: images and videos in forms. Range requests let browsers (Safari in particular) play and seek videos.
  app.get('/uploads/:name', async (c) => {
    const name = c.req.param('name');
    const kind = MEDIA_TYPES.find((t) => name.endsWith(`.${t.ext}`));
    if (!/^[\w-]{20}\.\w+$/.test(name) || !kind) return c.notFound();
    const file = Bun.file(join(uploadDir, name));
    if (!(await file.exists())) return c.notFound();
    c.header('content-type', kind.type);
    c.header('cache-control', 'public, max-age=31536000, immutable');
    c.header('accept-ranges', 'bytes');
    const size = file.size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        c.header('content-range', `bytes */${size}`);
        return c.body(null, 416);
      }
      c.header('content-range', `bytes ${start}-${end}/${size}`);
      return c.body(file.slice(start, end + 1).stream(), 206);
    }
    return c.body(file.stream());
  });

  // --- Owner: forms ---
  app.get('/api/forms', (c) =>
    c.json(db.query(`
      SELECT f.id, json_extract(f.doc, '$.title') AS title, f.created_at AS createdAt, f.updated_at AS updatedAt,
             f.published_at AS publishedAt, (f.published IS NOT NULL AND f.published <> f.doc) AS unpublished,
             (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS responses
      FROM forms f ORDER BY f.updated_at DESC`).all().map((r: any) => ({ ...r, unpublished: !!r.unpublished }))),
  );

  app.post('/api/forms', async (c) => {
    const body = await readJson(c);
    const title = (typeof body?.title === 'string' && body.title.trim().slice(0, 200)) || 'Untitled form';
    const id = newId();
    const now = Date.now();
    db.query('INSERT INTO forms (id, doc, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, JSON.stringify(newForm(title)), now, now);
    return c.json({ id }, 201);
  });

  /** Publish state for the editor: when it went live, and whether the draft differs from it. */
  const state = (id: string) => {
    const r = row(id)!;
    return { publishedAt: r.published_at, unpublished: r.published !== null && r.published !== r.doc };
  };

  app.get('/api/forms/:id', (c) => {
    const id = c.req.param('id');
    const doc = getForm(id);
    return doc ? c.json({ id, doc, ...state(id) }) : c.json({ error: 'Form not found.' }, 404);
  });

  /** Save the draft. The live link does not change until Publish. */
  app.put('/api/forms/:id', async (c) => {
    const id = c.req.param('id');
    const doc = parseFormDoc(await readJson(c));
    if (!doc) return c.json({ error: 'The form data is not valid.' }, 400);
    const r = db.query('UPDATE forms SET doc = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(doc), Date.now(), id);
    return r.changes ? c.json({ ok: true, ...state(id) }) : c.json({ error: 'Form not found.' }, 404);
  });

  /** Publish: the live link now shows the saved draft. A body, if sent, is saved first. */
  app.post('/api/forms/:id/publish', async (c) => {
    const id = c.req.param('id');
    if (!row(id)) return c.json({ error: 'Form not found.' }, 404);
    const body = await readJson(c);
    if (body) {
      const doc = parseFormDoc(body);
      if (!doc) return c.json({ error: 'The form data is not valid.' }, 400);
      db.query('UPDATE forms SET doc = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(doc), Date.now(), id);
    }
    db.query('UPDATE forms SET published = doc, published_at = ? WHERE id = ?').run(Date.now(), id);
    return c.json({ ok: true, ...state(id) });
  });

  app.delete('/api/forms/:id', (c) => {
    const r = db.query('DELETE FROM forms WHERE id = ?').run(c.req.param('id'));
    return r.changes ? c.json({ ok: true }) : c.json({ error: 'Form not found.' }, 404);
  });

  app.get('/api/forms/:id/responses', (c) => {
    const id = c.req.param('id');
    const doc = getForm(id);
    if (!doc) return c.json({ error: 'Form not found.' }, 404);
    const rows = db.query<{ id: number; answers: string; createdAt: number }, [string]>(
      'SELECT id, answers, created_at AS createdAt FROM responses WHERE form_id = ? ORDER BY created_at DESC').all(id);
    return c.json({ doc, responses: rows.map((r) => ({ ...r, answers: JSON.parse(r.answers) })) });
  });

  // --- Public: anyone with the link ---
  app.get('/api/public/forms/:id', (c) => {
    const doc = getPublished(c.req.param('id'));
    return doc ? c.json({ id: c.req.param('id'), doc }) : c.json({ error: 'Form not found.' }, 404);
  });

  // shortcut: no spam protection on submissions. Add a rate limit or captcha if a form gets abused.
  app.post('/api/public/forms/:id/responses', async (c) => {
    const id = c.req.param('id');
    // Answers are checked against the live version, the one the visitor saw.
    const doc = getPublished(id);
    if (!doc) return c.json({ error: 'Form not found.' }, 404);
    const body = await readJson(c);
    const result = checkAnswers(doc, body?.answers);
    if (!result.ok) return c.json({ error: 'Some answers need attention.', errors: result.errors }, 400);
    db.query('INSERT INTO responses (form_id, answers, created_at) VALUES (?, ?, ?)').run(id, JSON.stringify(result.answers), Date.now());
    return c.json({ ok: true }, 201);
  });

  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
  return app;
}
