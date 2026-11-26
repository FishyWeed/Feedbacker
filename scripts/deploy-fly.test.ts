import { expect, test } from 'bun:test';
import { plan, VOLUME, type State } from './deploy-fly';

const empty: State = { apps: [], machines: [], volumes: [], secrets: [] };
const says = (p: ReturnType<typeof plan>) => p.steps.map((s) => s.args.slice(0, 2).join(' '));

test('new app: make it, its disk and its secrets, then deploy one machine', () => {
  const p = plan({ app: 'my-fb', region: 'sin', adminEmail: 'me@example.com' }, empty);
  expect(p.errors).toEqual([]);
  expect(says(p)).toEqual(['apps create', `volumes create`, 'secrets set', 'deploy -a', 'scale count']);
  expect(p.steps[2]!.args).toEqual(['secrets', 'set', 'ADMIN_EMAIL=me@example.com', 'CLIENT_IP_HEADER=Fly-Client-IP', '--stage', '-a', 'my-fb']);
  expect(p.steps[3]!.args).toContain('--ha=false');
  expect(p.steps.some((s) => s.removes)).toBe(false);
});

test('second run: only deploy and keep one machine', () => {
  const s: State = { apps: ['my-fb'], machines: [{ id: 'm1', region: 'sin', hasMount: true }], volumes: [{ id: 'v1', name: VOLUME, region: 'sin' }], secrets: ['ADMIN_EMAIL', 'CLIENT_IP_HEADER'] };
  const p = plan({ app: 'my-fb', region: 'sin' }, s);
  expect(says(p)).toEqual(['deploy -a', 'scale count']);
  expect(p.notes).toEqual([]);
});

test("Fly's launch page left machines without a disk: remove them (asked first), make the disk", () => {
  const s: State = { apps: ['my-fb'], machines: [{ id: 'a', region: 'sin', hasMount: false }, { id: 'b', region: 'sin', hasMount: false }], volumes: [], secrets: [] };
  const p = plan({ app: 'my-fb', region: 'sin' }, s);
  expect(p.steps.filter((x) => x.removes).map((x) => x.args[2])).toEqual(['a', 'b']);
  expect(p.notes[0]).toContain('first account');
});

test('a data disk in another region is never touched: stop', () => {
  const s: State = { apps: ['my-fb'], machines: [{ id: 'm1', region: 'iad', hasMount: true }], volumes: [{ id: 'v1', name: VOLUME, region: 'iad' }], secrets: [] };
  const p = plan({ app: 'my-fb', region: 'sin' }, s);
  expect(p.errors[0]).toContain('--region iad');
  expect(p.steps.some((x) => x.args[0] === 'volumes' || x.removes)).toBe(false);
});
