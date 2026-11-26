import type { Database } from 'bun:sqlite';
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from 'hono/bun';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { secureHeaders } from 'hono/secure-headers';
import { checkAnswers } from '../shared/logic';
import { LANDING_THEMES, parseDevSettings, type LandingThemeId } from '../shared/devSettings';
import { REPO_SLUG } from '../shared/repo';
import { newForm, parseFormDoc, type FormDoc } from '../shared/schema';

/**
 * Two modes, one app:
 * - `single` (default, for self-hosting): one owner, whose username and password are in .env.
 * - `hosted` (a public website): anyone signs up with an email and a password and sees only their own forms.
 *   `adminEmail` is the site owner's account: it sets the landing page look and takes over the forms made in single mode.
 */
type Options = {
  db: Database; secret: string; uploadDir: string; fetchGitHub?: typeof fetch;
  mode?: 'single' | 'hosted'; username?: string; password?: string;
  adminEmail?: string; uploadLimitMb?: number; clientIpHeader?: string;
};
type Env = { Variables: { uid: number } };

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
const MAX_SIGNUPS = 5; // per address per hour
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

const sha256 = (s: string) => new Bun.CryptoHasher('sha256').update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));
const str = (x: unknown) => (typeof x === 'string' ? x : '');
/** A plain check only: there is no confirmation email, so the address is never proven. */
const normEmail = (x: unknown) => { const e = str(x).trim().toLowerCase(); return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null; };
const passwordProblem = (p: string) =>
  p.length < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters.` : p.length > PASSWORD_MAX ? `Use at most ${PASSWORD_MAX} characters.` : null;

// 64 symbols, so `byte & 63` has no bias. 10 symbols = 60 random bits.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ALPHABET[b & 63]).join('');

const isHttps = (c: Context) => c.req.url.startsWith('https:') || c.req.header('x-forwarded-proto') === 'https';
const readJson = (c: Context) => c.req.json().catch(() => null);

export function createApp({ db, secret, uploadDir, fetchGitHub = fetch, mode = 'single', username = '', password = '', adminEmail, uploadLimitMb = 100, clientIpHeader }: Options) {
  const hosted = mode === 'hosted';
  const app = new Hono<Env>();
  app.use('*', secureHeaders());
  const tooLarge = (c: Context) => c.json({ error: 'Request is too large.' }, 413);
  const smallBody = bodyLimit({ maxSize: 1024 * 1024, onError: tooLarge });
  app.use('/api/*', (c, next) => (c.req.path === '/api/uploads' ? next() : smallBody(c, next)));

  // The socket address cannot be faked, unlike X-Forwarded-For. Behind a proxy (Fly.io, Railway, a VPS with Caddy) every
  // visitor has the proxy's address, so the operator names the header that the proxy sets (CLIENT_IP_HEADER).
  const clientIp = (c: Context) => {
    const h = clientIpHeader && c.req.header(clientIpHeader)?.split(',')[0]?.trim();
    if (h) return h;
    try { return getConnInfo(c).remote.address ?? 'unknown'; } catch { return 'unknown'; }
  };

  /** Parse on read too, so forms saved by an older version get defaults for newer fields. */
  const parse = (json: string | null) => {
    if (!json) return null;
    const raw = JSON.parse(json);
    return parseFormDoc(raw) ?? (raw as FormDoc);
  };
  type FormRow = { doc: string; published: string | null; published_at: number | null; updated_at: number; owner: number };
  const row = (id: string) => db.query<FormRow, [string]>('SELECT doc, published, published_at, updated_at, owner FROM forms WHERE id = ?').get(id);
  /** The form, only if this account owns it. Another account's form looks the same as a missing one. */
  const ownRow = (id: string, uid: number) => { const r = row(id); return r && r.owner === uid ? r : null; };
  /** The saved draft (owner side). */
  const getForm = (id: string, uid: number) => parse(ownRow(id, uid)?.doc ?? null);
  /** What the live link shows: the last published version, or null if never published. */
  const getPublished = (id: string) => parse(row(id)?.published ?? null);

  // --- Accounts and sessions ---
  // The cookie holds "user id.version.expiry", signed. User 0 is the single owner from .env.
  type User = { id: number; email: string; pass: string; ver: number };
  const userById = (id: number) => db.query<User, [number]>('SELECT id, email, pass, ver FROM users WHERE id = ?').get(id);
  const isAdmin = (uid: number) => !hosted || (!!adminEmail && userById(uid)?.email === adminEmail.trim().toLowerCase());
  async function startSession(c: Context, uid: number, ver: number) {
    await setSignedCookie(c, COOKIE, `${uid}.${ver}.${Date.now() + SESSION_SECONDS * 1000}`, secret, {
      httpOnly: true, sameSite: 'Strict', path: '/', maxAge: SESSION_SECONDS, secure: isHttps(c),
    });
  }
  /** The site owner's account takes over forms made before hosted mode was turned on. */
  const claimOldForms = (uid: number) => { if (hosted && isAdmin(uid)) db.query('UPDATE forms SET owner = ? WHERE owner = 0').run(uid); };
  // A login for an unknown email still checks a password, so the response time does not show which emails exist.
  let dummyHash = '';
  const checkPassword = async (p: string, hash: string | undefined) => {
    if (!p) return false;
    if (!hash) dummyHash ||= await Bun.password.hash('not-a-real-account');
    try { return await Bun.password.verify(p, hash ?? dummyHash); } catch { return false; }
  };

  // shortcut: failed-login and sign-up counts live in memory, so a restart clears them. Use a shared store if you
  // run more than one server.
  const fails = new Map<string, { n: number; until: number }>();
  const signups = new Map<string, { n: number; until: number }>();

  app.get('/api/site', (c) => c.json({ mode, landing: getLanding() }));

  app.post('/api/login', async (c) => {
    const ip = clientIp(c);
    const now = Date.now();
    const f = fails.get(ip);
    if (f && f.until > now && f.n >= MAX_FAILS) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    const body = await readJson(c);
    let user: { id: number; ver: number } | null = null;
    if (hosted) {
      const email = normEmail(body?.email);
      const u = email ? db.query<User, [string]>('SELECT id, email, pass, ver FROM users WHERE email = ?').get(email) : null;
      if ((await checkPassword(str(body?.password), u?.pass)) && u) user = u;
    } else {
      // Check both values every time, so the response time does not show which one was wrong.
      if ([same(str(body?.username), username), same(str(body?.password), password)].every(Boolean)) user = { id: 0, ver: 0 };
    }
    if (!user) {
      fails.set(ip, { n: (f && f.until > now ? f.n : 0) + 1, until: now + LOCK_MS });
      return c.json({ error: hosted ? 'Wrong email or password.' : 'Wrong username or password.' }, 401);
    }
    fails.delete(ip);
    claimOldForms(user.id);
    await startSession(c, user.id, user.ver);
    return c.json({ ok: true });
  });

  app.post('/api/signup', async (c) => {
    if (!hosted) return c.json({ error: 'This server has one owner. Sign-up is off.' }, 404);
    const ip = clientIp(c);
    const now = Date.now();
    const s = signups.get(ip);
    if (s && s.until > now && s.n >= MAX_SIGNUPS) return c.json({ error: 'Too many new accounts from this network. Try again in an hour.' }, 429);
    const body = await readJson(c);
    const email = normEmail(body?.email);
    const p = str(body?.password);
    const problem = passwordProblem(p);
    if (!email || problem) {
      return c.json({ error: 'Some fields need attention.', errors: { ...(email ? {} : { email: 'Enter a valid email address.' }), ...(problem ? { password: problem } : {}) } }, 400);
    }
    const pass = await Bun.password.hash(p);
    let id: number;
    try {
      id = Number(db.query('INSERT INTO users (email, pass, created_at) VALUES (?, ?, ?)').run(email, pass, now).lastInsertRowid);
    } catch {
      return c.json({ error: 'An account with this email already exists. Sign in instead.', errors: { email: 'This email already has an account.' } }, 409);
    }
    signups.set(ip, { n: (s && s.until > now ? s.n : 0) + 1, until: s && s.until > now ? s.until : now + 3_600_000 });
    claimOldForms(id);
    await startSession(c, id, 0);
    return c.json({ ok: true }, 201);
  });

  app.post('/api/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  const owner = createMiddleware<Env>(async (c, next) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec((await getSignedCookie(c, secret, COOKIE)) || '');
    const uid = Number(m?.[1]);
    const ok = !!m && Number(m[3]) > Date.now() && (hosted ? userById(uid)?.ver === Number(m[2]) : uid === 0);
    if (!ok) return c.json({ error: 'Not signed in.' }, 401);
    c.set('uid', uid);
    await next();
  });
  for (const p of ['/api/me', '/api/account', '/api/account/*', '/api/forms', '/api/forms/*', '/api/uploads', '/api/settings']) app.use(p, owner);

  /** Who is signed in: the mode, the email (hosted mode) and whether this account sets the landing page. */
  app.get('/api/me', (c) => { const uid = c.get('uid'); return c.json({ mode, email: hosted ? userById(uid)?.email : undefined, admin: isAdmin(uid) }); });

  // --- Hosted mode: change the password, delete the account. In single mode the password lives in .env. ---
  app.put('/api/account/password', async (c) => {
    if (!hosted) return c.json({ error: 'Change ADMIN_PASSWORD in .env, then restart the server.' }, 404);
    const u = userById(c.get('uid'))!;
    const body = await readJson(c);
    if (!(await checkPassword(str(body?.current), u.pass))) return c.json({ error: 'The current password is wrong.', errors: { current: 'Wrong password.' } }, 400);
    const problem = passwordProblem(str(body?.next));
    if (problem) return c.json({ error: problem, errors: { next: problem } }, 400);
    db.query('UPDATE users SET pass = ?, ver = ver + 1 WHERE id = ?').run(await Bun.password.hash(str(body.next)), u.id);
    await startSession(c, u.id, u.ver + 1); // this device stays signed in; every other session ends
    return c.json({ ok: true });
  });

  app.delete('/api/account', async (c) => {
    if (!hosted) return c.json({ error: 'This server has one owner from .env.' }, 404);
    const u = userById(c.get('uid'))!;
    const body = await readJson(c);
    if (!(await checkPassword(str(body?.password), u.pass))) return c.json({ error: 'The password is wrong.', errors: { password: 'Wrong password.' } }, 400);
    const files = db.query<{ name: string }, [number]>('SELECT name FROM uploads WHERE owner = ?').all(u.id);
    db.transaction(() => {
      db.query('DELETE FROM forms WHERE owner = ?').run(u.id); // responses go with their forms
      db.query('DELETE FROM uploads WHERE owner = ?').run(u.id);
      db.query('DELETE FROM settings WHERE key = ?').run(`dev:${u.id}`);
      db.query('DELETE FROM users WHERE id = ?').run(u.id);
    })();
    for (const f of files) rmSync(join(uploadDir, f.name), { force: true });
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // --- Dev mode appearance (theme, color mode, fonts): one set per account. The landing page look is one for the site. ---
  const setting = (key: string) => JSON.parse(db.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? 'null');
  const saveSetting = (key: string, v: unknown) =>
    db.query('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(v));
  const devKey = (uid: number) => (uid === 0 ? 'dev' : `dev:${uid}`);
  // Older versions kept the landing look inside the owner's settings.
  const getLanding = (): LandingThemeId => { const l = setting('landing'); return LANDING_THEMES.some((t) => t.id === l) ? l : parseDevSettings(setting('dev')).landing; };
  app.get('/api/settings', (c) => c.json({ ...parseDevSettings(setting(devKey(c.get('uid')))), landing: getLanding() }));
  app.put('/api/settings', async (c) => {
    const uid = c.get('uid');
    const s = parseDevSettings(await readJson(c));
    saveSetting(devKey(uid), s);
    if (isAdmin(uid)) saveSetting('landing', s.landing);
    return c.json({ ...s, landing: getLanding() });
  });

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

  // --- Owner: image and video uploads, saved next to the database ---
  // shortcut: files stay when a block, background or form is deleted (they go with the account). Add a cleanup job
  // if disk space matters.
  app.post('/api/uploads', bodyLimit({ maxSize: MAX_VIDEO + 64 * 1024, onError: tooLarge }), async (c) => {
    const uid = c.get('uid');
    const form = await c.req.parseBody().catch(() => null);
    const file = form?.file;
    if (!(file instanceof File)) return c.json({ error: 'Choose a file.' }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = MEDIA_TYPES.find((t) => t.test(bytes));
    if (!kind) return c.json({ error: 'Use a PNG, JPEG, GIF or WebP image, or an MP4 or WebM video.' }, 400);
    if (file.size > kind.max) return c.json({ error: `The file must be ${kind.max / MB} MB or smaller.` }, 413);
    if (hosted) {
      const used = db.query<{ n: number }, [number]>('SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE owner = ?').get(uid)!.n;
      if (used + bytes.length > uploadLimitMb * MB) return c.json({ error: `Your storage is full (${uploadLimitMb} MB). Remove a video or an image first.` }, 413);
    }
    const name = `${newId()}${newId()}.${kind.ext}`;
    mkdirSync(uploadDir, { recursive: true });
    await Bun.write(join(uploadDir, name), bytes);
    db.query('INSERT INTO uploads (name, owner, size, created_at) VALUES (?, ?, ?, ?)').run(name, uid, bytes.length, Date.now());
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

  // --- Owner: forms (each account sees only its own) ---
  app.get('/api/forms', (c) =>
    c.json(db.query(`
      SELECT f.id, json_extract(f.doc, '$.title') AS title, f.created_at AS createdAt, f.updated_at AS updatedAt,
             f.published_at AS publishedAt, (f.published IS NOT NULL AND f.published <> f.doc) AS unpublished,
             (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) AS responses
      FROM forms f WHERE f.owner = ? ORDER BY f.updated_at DESC`).all(c.get('uid')).map((r: any) => ({ ...r, unpublished: !!r.unpublished }))),
  );

  app.post('/api/forms', async (c) => {
    const body = await readJson(c);
    const title = (typeof body?.title === 'string' && body.title.trim().slice(0, 200)) || 'Untitled form';
    const id = newId();
    const now = Date.now();
    db.query('INSERT INTO forms (id, doc, created_at, updated_at, owner) VALUES (?, ?, ?, ?, ?)').run(id, JSON.stringify(newForm(title)), now, now, c.get('uid'));
    return c.json({ id }, 201);
  });

  /** Publish state for the editor: when it went live, and whether the draft differs from it. */
  const state = (id: string) => {
    const r = row(id)!;
    return { publishedAt: r.published_at, unpublished: r.published !== null && r.published !== r.doc };
  };

  app.get('/api/forms/:id', (c) => {
    const id = c.req.param('id');
    const doc = getForm(id, c.get('uid'));
    return doc ? c.json({ id, doc, ...state(id) }) : c.json({ error: 'Form not found.' }, 404);
  });

  /** Save the draft. The live link does not change until Publish. */
  app.put('/api/forms/:id', async (c) => {
    const id = c.req.param('id');
    const doc = parseFormDoc(await readJson(c));
    if (!doc) return c.json({ error: 'The form data is not valid.' }, 400);
    const r = db.query('UPDATE forms SET doc = ?, updated_at = ? WHERE id = ? AND owner = ?').run(JSON.stringify(doc), Date.now(), id, c.get('uid'));
    return r.changes ? c.json({ ok: true, ...state(id) }) : c.json({ error: 'Form not found.' }, 404);
  });

  /** Publish: the live link now shows the saved draft. A body, if sent, is saved first. */
  app.post('/api/forms/:id/publish', async (c) => {
    const id = c.req.param('id');
    if (!ownRow(id, c.get('uid'))) return c.json({ error: 'Form not found.' }, 404);
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
    const r = db.query('DELETE FROM forms WHERE id = ? AND owner = ?').run(c.req.param('id'), c.get('uid'));
    return r.changes ? c.json({ ok: true }) : c.json({ error: 'Form not found.' }, 404);
  });

  app.get('/api/forms/:id/responses', (c) => {
    const id = c.req.param('id');
    const doc = getForm(id, c.get('uid'));
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
