import { expect, test } from 'bun:test';
import { createApp } from './app';
import { openDb } from './db';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const uploadDir = join(mkdtempSync(join(tmpdir(), 'feedbacker-')), 'uploads');

const app = createApp({ db: openDb(':memory:'), username: 'owner', password: 'correct-horse', secret: 'test-secret', uploadDir });
const call = (path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
  app.request(path, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

test('owner flow: sign in, build a form, collect a response', async () => {
  expect((await call('/api/forms')).status).toBe(401);
  expect((await call('/api/login', { method: 'POST', body: { username: 'owner', password: 'wrong' } })).status).toBe(401);

  const login = await call('/api/login', { method: 'POST', body: { username: 'owner', password: 'correct-horse' } });
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  expect(login.headers.get('set-cookie')).toContain('HttpOnly');

  const created = await call('/api/forms', { method: 'POST', body: { title: 'Event feedback' }, cookie });
  const { id } = await created.json();
  expect(created.status).toBe(201);

  const { doc } = await (await call(`/api/forms/${id}`, { cookie })).json();
  doc.sections[0].rows[0].columns[0].blocks.push({ id: 'q1', kind: 'rating', label: 'Rate it', required: true, max: 5 });
  expect((await call(`/api/forms/${id}`, { method: 'PUT', body: doc, cookie })).status).toBe(200);
  expect((await call(`/api/forms/${id}`, { method: 'PUT', body: { title: 1 }, cookie })).status).toBe(400);

  // A saved draft is not live until it is published.
  expect((await call(`/api/public/forms/${id}`)).status).toBe(404);
  const pub = await call(`/api/forms/${id}/publish`, { method: 'POST', cookie });
  expect(await pub.json()).toMatchObject({ ok: true, unpublished: false });

  // Public side: no cookie needed.
  expect((await call(`/api/public/forms/${id}`)).status).toBe(200);
  // A later draft change does not reach the live link until the next publish.
  const draft = { ...doc, title: 'Changed in draft' };
  expect(await (await call(`/api/forms/${id}`, { method: 'PUT', body: draft, cookie })).json()).toMatchObject({ unpublished: true });
  expect((await (await call(`/api/public/forms/${id}`)).json()).doc.title).toBe('Event feedback');
  const bad = await call(`/api/public/forms/${id}/responses`, { method: 'POST', body: { answers: {} } });
  expect(bad.status).toBe(400);
  expect((await bad.json()).errors).toEqual({ q1: 'Choose a rating from 1 to 5.' });
  expect((await call(`/api/public/forms/${id}/responses`, { method: 'POST', body: { answers: { q1: 4 } } })).status).toBe(201);

  const list = await (await call('/api/forms', { cookie })).json();
  expect(list[0]).toMatchObject({ id, title: 'Changed in draft', responses: 1, unpublished: true });
  const res = await (await call(`/api/forms/${id}/responses`, { cookie })).json();
  expect(res.responses[0].answers).toEqual({ q1: 4 });

  expect((await call(`/api/forms/${id}`, { method: 'DELETE', cookie })).status).toBe(200);
  expect((await call(`/api/public/forms/${id}`)).status).toBe(404);
});

test('image upload: owner only, real images only, served back', async () => {
  const upload = (bytes: Uint8Array<ArrayBuffer>, cookie?: string) => {
    const form = new FormData();
    form.append('file', new File([bytes], 'x.png', { type: 'image/png' }));
    return app.request('/api/uploads', { method: 'POST', body: form, headers: cookie ? { cookie } : {} });
  };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  expect((await upload(png)).status).toBe(401);

  const login = await call('/api/login', { method: 'POST', body: { username: 'owner', password: 'correct-horse' } });
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  // A text file with a .png name and an image/png type is still rejected.
  expect((await upload(new TextEncoder().encode('<script>alert(1)</script>'), cookie)).status).toBe(400);

  const ok = await upload(png, cookie);
  expect(ok.status).toBe(201);
  const { url } = await ok.json();
  expect(url).toMatch(/^\/uploads\/[\w-]{20}\.png$/);
  const got = await app.request(url);
  expect(got.headers.get('content-type')).toBe('image/png');
  expect(new Uint8Array(await got.arrayBuffer())).toEqual(png);
  expect((await app.request('/uploads/..%2F..%2Fsecret.png')).status).toBe(404);

  // Video: MP4 is detected by its "ftyp" box and served in byte ranges.
  const mp4 = new Uint8Array(64);
  mp4.set(new TextEncoder().encode('ftypisom'), 4);
  const v = await upload(mp4, cookie);
  expect(v.status).toBe(201);
  const vurl = (await v.json()).url as string;
  expect(vurl).toEndWith('.mp4');
  const part = await app.request(vurl, { headers: { range: 'bytes=4-11' } });
  expect(part.status).toBe(206);
  expect(part.headers.get('content-range')).toBe('bytes 4-11/64');
  expect(new TextDecoder().decode(await part.arrayBuffer())).toBe('ftypisom');
  expect((await app.request(vurl, { headers: { range: 'bytes=100-' } })).status).toBe(416);
});

test('dev settings: owner only, unknown values fall back to defaults', async () => {
  expect((await call('/api/settings')).status).toBe(401);
  const login = await call('/api/login', { method: 'POST', body: { username: 'owner', password: 'correct-horse' } });
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  const saved = await (await call('/api/settings', { method: 'PUT', cookie, body: { devTheme: 'arcade', mode: 'dark', fonts: { ui: 'press-start-2p', heading: 'silkscreen', label: 'space-mono' } } })).json();
  // A pixel font is never offered for body text, so it falls back to System UI.
  expect(saved).toEqual({ devTheme: 'arcade', landing: 'paper', mode: 'dark', fonts: { ui: 'system', heading: 'silkscreen', label: 'space-mono' } });
  expect(await (await call('/api/settings', { cookie })).json()).toEqual(saved);
});

test('landing page look: Paper by default, public read, owner-only change', async () => {
  const landing = async () => (await (await call('/api/site')).json()).landing;
  expect(await (await call('/api/site')).json()).toEqual({ mode: 'single', landing: 'paper' });
  const login = await call('/api/login', { method: 'POST', body: { username: 'owner', password: 'correct-horse' } });
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  await call('/api/settings', { method: 'PUT', cookie, body: { landing: 'arcade' } });
  expect(await landing()).toBe('arcade');
  await call('/api/settings', { method: 'PUT', cookie, body: { landing: 'neon' } }); // unknown: back to Paper
  expect(await landing()).toBe('paper');
});

test('a forged session cookie is rejected', async () => {
  expect((await call('/api/me', { cookie: `feedbacker_session=0.0.${Date.now() + 1e9}` })).status).toBe(401);
});

test('single mode: no sign-up and no account routes', async () => {
  expect((await call('/api/signup', { method: 'POST', body: { email: 'a@b.co', password: 'password1' } })).status).toBe(404);
  const login = await call('/api/login', { method: 'POST', body: { username: 'owner', password: 'correct-horse' } });
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  expect(await (await call('/api/me', { cookie })).json()).toEqual({ mode: 'single', admin: true });
  expect((await call('/api/account', { method: 'DELETE', cookie, body: { password: 'correct-horse' } })).status).toBe(404);
});

test('hosted mode: sign up, private forms, admin takes over old forms, storage limit, password change, delete account', async () => {
  const db = openDb(':memory:');
  // A form made in single mode before the switch (owner 0).
  db.query("INSERT INTO forms (id, doc, created_at, updated_at) VALUES ('oldform001', '{\"title\":\"Old\",\"sections\":[]}', 1, 1)").run();
  const dir = join(mkdtempSync(join(tmpdir(), 'feedbacker-')), 'uploads');
  const h = createApp({ db, secret: 's', uploadDir: dir, mode: 'hosted', adminEmail: 'Boss@Example.com', uploadLimitMb: 0.0001 });
  const req = (path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
    h.request(path, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const cookieOf = (r: Response) => r.headers.get('set-cookie')!.split(';')[0]!;

  expect(await (await req('/api/site')).json()).toMatchObject({ mode: 'hosted' });
  // Bad input, then a new account, then the same email again.
  const bad = await req('/api/signup', { method: 'POST', body: { email: 'nope', password: 'short' } });
  expect(bad.status).toBe(400);
  expect(Object.keys((await bad.json()).errors).sort()).toEqual(['email', 'password']);
  const a = await req('/api/signup', { method: 'POST', body: { email: 'Ann@Example.com ', password: 'ann-password' } });
  expect(a.status).toBe(201);
  const ann = cookieOf(a);
  expect((await req('/api/signup', { method: 'POST', body: { email: 'ann@example.com', password: 'other-password' } })).status).toBe(409);
  expect(await (await req('/api/me', { cookie: ann })).json()).toEqual({ mode: 'hosted', email: 'ann@example.com', admin: false });
  // The single-mode owner login does not exist here.
  expect((await req('/api/login', { method: 'POST', body: { username: 'owner', password: 'correct-horse' } })).status).toBe(401);

  // Ann's form is private: Bob can neither list, read, change, publish nor delete it.
  const { id } = await (await req('/api/forms', { method: 'POST', body: { title: 'Ann form' }, cookie: ann })).json();
  const bob = cookieOf(await req('/api/signup', { method: 'POST', body: { email: 'bob@example.com', password: 'bob-password' } }));
  expect(await (await req('/api/forms', { cookie: bob })).json()).toEqual([]);
  expect((await req(`/api/forms/${id}`, { cookie: bob })).status).toBe(404);
  expect((await req(`/api/forms/${id}`, { method: 'PUT', body: { title: 'x', sections: [] }, cookie: bob })).status).toBe(404);
  expect((await req(`/api/forms/${id}/publish`, { method: 'POST', cookie: bob })).status).toBe(404);
  expect((await req(`/api/forms/${id}/responses`, { cookie: bob })).status).toBe(404);
  expect((await req(`/api/forms/${id}`, { method: 'DELETE', cookie: bob })).status).toBe(404);
  expect((await (await req('/api/forms', { cookie: ann })).json()).map((f: { id: string }) => f.id)).toEqual([id]);
  // The old form belongs to nobody yet; only the admin can change the landing page.
  expect((await req('/api/forms/oldform001', { cookie: ann })).status).toBe(404);
  await req('/api/settings', { method: 'PUT', cookie: ann, body: { landing: 'arcade' } });
  expect((await (await req('/api/site')).json()).landing).toBe('paper');

  // The admin (ADMIN_EMAIL, any letter case) takes over the old form at sign-up and sets the landing page.
  const boss = cookieOf(await req('/api/signup', { method: 'POST', body: { email: 'boss@example.com', password: 'boss-password' } }));
  expect((await req('/api/forms/oldform001', { cookie: boss })).status).toBe(200);
  await req('/api/settings', { method: 'PUT', cookie: boss, body: { landing: 'arcade', devTheme: 'ink' } });
  expect((await (await req('/api/site')).json()).landing).toBe('arcade');
  expect((await (await req('/api/settings', { cookie: ann })).json()).devTheme).toBe('default'); // settings are per account

  // Storage limit (about 100 bytes here).
  const upload = (n: number) => { const b = new Uint8Array(n); b.set([0x89, 0x50, 0x4e, 0x47]); const f = new FormData(); f.append('file', new File([b], 'x.png')); return h.request('/api/uploads', { method: 'POST', body: f, headers: { cookie: ann } }); };
  const up = await upload(60);
  expect(up.status).toBe(201);
  expect((await upload(60)).status).toBe(413);

  // Wrong passwords fail; a password change ends Ann's other sessions.
  expect((await req('/api/login', { method: 'POST', body: { email: 'ann@example.com', password: 'wrong-password' } })).status).toBe(401);
  const ann2 = cookieOf(await req('/api/login', { method: 'POST', body: { email: 'ANN@example.com', password: 'ann-password' } }));
  expect((await req('/api/account/password', { method: 'PUT', cookie: ann, body: { current: 'wrong', next: 'new-password' } })).status).toBe(400);
  const changed = await req('/api/account/password', { method: 'PUT', cookie: ann, body: { current: 'ann-password', next: 'new-password' } });
  expect(changed.status).toBe(200);
  expect((await req('/api/me', { cookie: ann2 })).status).toBe(401);
  const ann3 = cookieOf(changed);
  expect((await req('/api/me', { cookie: ann3 })).status).toBe(200);

  // Delete the account: forms, answers, files and the account go; the live link stops working.
  await req(`/api/forms/${id}/publish`, { method: 'POST', cookie: ann3 });
  expect((await req(`/api/public/forms/${id}`)).status).toBe(200);
  expect((await req('/api/account', { method: 'DELETE', cookie: ann3, body: { password: 'ann-password' } })).status).toBe(400);
  expect((await req('/api/account', { method: 'DELETE', cookie: ann3, body: { password: 'new-password' } })).status).toBe(200);
  expect((await req(`/api/public/forms/${id}`)).status).toBe(404);
  expect((await h.request((await up.json()).url)).status).toBe(404);
  expect((await req('/api/me', { cookie: ann3 })).status).toBe(401);
  expect((await req('/api/login', { method: 'POST', body: { email: 'ann@example.com', password: 'new-password' } })).status).toBe(401);
  expect(await (await req('/api/forms', { cookie: bob })).json()).toEqual([]);
});

test('too many failed logins are blocked', async () => {
  const a = createApp({ db: openDb(':memory:'), username: 'u', password: 'password1', secret: 's', uploadDir });
  const bad = () => a.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"username":"u","password":"x"}' });
  for (let i = 0; i < 5; i++) expect((await bad()).status).toBe(401);
  expect((await bad()).status).toBe(429);
});

test('star count: asked from GitHub once, then cached; null when GitHub fails', async () => {
  let calls = 0;
  const ok = createApp({ db: openDb(':memory:'), username: 'u', password: 'password1', secret: 's', uploadDir,
    fetchGitHub: (async () => { calls++; return Response.json({ stargazers_count: 42 }); }) as unknown as typeof fetch });
  expect(await (await ok.request('/api/stars')).json()).toEqual({ stars: 42 });
  expect(await (await ok.request('/api/stars')).json()).toEqual({ stars: 42 });
  expect(calls).toBe(1);
  const down = createApp({ db: openDb(':memory:'), username: 'u', password: 'password1', secret: 's', uploadDir,
    fetchGitHub: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
  expect(await (await down.request('/api/stars')).json()).toEqual({ stars: null });
});
