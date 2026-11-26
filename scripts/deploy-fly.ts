// One command to put Feedbacker on Fly.io, or to update it: bun run deploy:fly -- --app <name> [options]
// It reads the app's state from flyctl, prints the plan, asks before it removes anything, then runs the steps.
// Run it again at any time: steps that are already done are skipped. The repository's fly.toml is never changed.
//
// Options:
//   --app <name>           Your Fly app (made if it does not exist). Your site: https://<name>.fly.dev
//   --region <code>        Region for the app and its data disk (default: primary_region in fly.toml). `fly platform regions`
//   --admin-email <email>  The admin account's email (ADMIN_EMAIL). Sign up with it at /admin/signup.
//   --signup open|closed   Close sign-up after you made your account, for a private site.
//   --org <slug>           Fly organization for a new app (default: your personal one).
//   --yes                  Do not ask before removing machines that have no data disk.
//   --plan                 Only print the plan. Nothing is made, changed or removed.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const VOLUME = 'feedbacker_data';
export type Options = { app: string; region: string; adminEmail?: string; signup?: 'open' | 'closed'; org?: string };
export type State = {
  apps: string[];
  machines: { id: string; region: string; hasMount: boolean }[];
  volumes: { id: string; name: string; region: string }[];
  secrets: string[];
};
export type Step = { say: string; args: string[]; removes?: boolean };

/** What to run, from what Fly has now. Pure, so it is tested without Fly (deploy-fly.test.ts). */
export function plan(o: Options, s: State): { steps: Step[]; errors: string[]; notes: string[] } {
  const steps: Step[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  const a = ['-a', o.app];
  if (!s.apps.includes(o.app)) steps.push({ say: `Make the app ${o.app}`, args: ['apps', 'create', o.app, ...(o.org ? ['--org', o.org] : [])] });

  // The data disk. One that exists in another region may hold data: never touch it, stop instead.
  const disks = s.volumes.filter((v) => v.name === VOLUME);
  const elsewhere = disks.filter((v) => v.region !== o.region);
  if (elsewhere.length) {
    errors.push(`The data disk ${VOLUME} is in ${elsewhere.map((v) => v.region).join(', ')}, not ${o.region}. Run again with --region ${elsewhere[0]!.region}.`);
  } else if (!disks.length) {
    steps.push({ say: `Make the 1 GB data disk in ${o.region}`, args: ['volumes', 'create', VOLUME, '--size', '1', '--region', o.region, '--yes', ...a] });
  }
  // Machines without the disk (for example from Fly's launch page) can hold no data; the deploy makes the right one.
  for (const m of s.machines.filter((m) => !m.hasMount)) {
    steps.push({ say: `Remove machine ${m.id} (${m.region}): it has no data disk`, args: ['machine', 'destroy', m.id, '--force', ...a], removes: true });
  }

  const secrets: string[] = [];
  if (o.adminEmail) secrets.push(`ADMIN_EMAIL=${o.adminEmail}`);
  else if (!s.secrets.includes('ADMIN_EMAIL')) notes.push('No ADMIN_EMAIL: the first account made on the site becomes the admin. Make yours right after the deploy.');
  if (!s.secrets.includes('CLIENT_IP_HEADER')) secrets.push('CLIENT_IP_HEADER=Fly-Client-IP');
  if (o.signup) secrets.push(`SIGNUP=${o.signup}`);
  // --stage: the deploy below starts the app with them, so there is no extra restart.
  if (secrets.length) steps.push({ say: `Set ${secrets.map((x) => x.split('=')[0]).join(', ')}`, args: ['secrets', 'set', ...secrets, '--stage', ...a] });

  // --ha=false: one machine only, because each machine would have its own disk and its own copy of the data.
  steps.push({ say: 'Build on Fly and deploy', args: ['deploy', ...a, '--primary-region', o.region, '--ha=false', '--remote-only'] });
  steps.push({ say: 'Keep exactly one machine', args: ['scale', 'count', '1', '--yes', ...a] });
  return { steps, errors, notes };
}

// ---------------------------------------------------------------------------------------------------------------
// Running it

function flyBinary(): string | null {
  const home = join(homedir(), '.fly', 'bin');
  for (const b of [process.env.FLY_BIN, 'fly', 'flyctl', join(home, 'flyctl.exe'), join(home, 'flyctl')]) {
    if (!b) continue;
    try { if (Bun.spawnSync([b, 'version'], { stdout: 'ignore', stderr: 'ignore' }).exitCode === 0) return b; } catch { /* not this one */ }
  }
  return null;
}

function args(argv: string[]) {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (!k.startsWith('--')) throw new Error(`Unknown argument: ${k}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[k.slice(2)] = true;
    else { out[k.slice(2)] = next; i++; }
  }
  return out;
}

async function main() {
  const fly = flyBinary();
  if (!fly) {
    console.error('flyctl is not installed. Install it, then run this again:');
    console.error('  Windows:      pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"');
    console.error('  macOS/Linux:  curl -L https://fly.io/install.sh | sh');
    process.exit(1);
  }
  const run = (a: string[]) => Bun.spawnSync([fly, ...a], { stdout: 'pipe', stderr: 'pipe' });
  const json = <T>(a: string[]): T => { const r = run([...a, '--json']); if (r.exitCode !== 0) throw new Error(`fly ${a.join(' ')}: ${r.stderr.toString().trim()}`); return JSON.parse(r.stdout.toString() || '[]'); };

  if (run(['auth', 'whoami']).exitCode !== 0) {
    console.error('You are not signed in to Fly.io. Run `fly auth login` (it opens your browser), then run this again.');
    process.exit(1);
  }

  const f = args(process.argv.slice(2));
  const ask = (q: string) => (process.stdin.isTTY ? prompt(q)?.trim() || undefined : undefined);
  const tomlRegion = /^primary_region\s*=\s*"([a-z0-9]+)"/m.exec(readFileSync('fly.toml', 'utf8'))?.[1] ?? 'sin';
  const app = (typeof f.app === 'string' ? f.app : ask('Fly app name (your site will be https://<name>.fly.dev):'))?.toLowerCase();
  if (!app || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(app)) { console.error('Give an app name: --app <name> (lowercase letters, digits and dashes).'); process.exit(1); }
  const region = typeof f.region === 'string' ? f.region : (ask(`Region (Enter for ${tomlRegion}):`) ?? tomlRegion);
  const adminEmail = typeof f['admin-email'] === 'string' ? f['admin-email'] : undefined;
  const signup = f.signup === 'open' || f.signup === 'closed' ? f.signup : undefined;
  if (f.signup !== undefined && !signup) { console.error('--signup must be "open" or "closed".'); process.exit(1); }
  if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) { console.error('--admin-email is not an email address.'); process.exit(1); }
  if (!(run(['deploy', '--help']).stdout.toString().includes('--primary-region'))) {
    console.error('Your flyctl is too old for this script. Run `fly version upgrade`, then run this again.');
    process.exit(1);
  }

  // Read what Fly has now. A new app has no machines, disks or secrets yet.
  const apps = json<{ Name?: string; name?: string }[]>(['apps', 'list']).map((x) => x.Name ?? x.name ?? '');
  const exists = apps.includes(app);
  const name = (x: { Name?: string; name?: string }) => x.Name ?? x.name ?? '';
  const state: State = {
    apps,
    machines: exists ? json<{ id: string; region: string; config?: { mounts?: unknown[] } }[]>(['machines', 'list', '-a', app]).map((m) => ({ id: m.id, region: m.region, hasMount: !!m.config?.mounts?.length })) : [],
    volumes: exists ? json<{ id: string; name: string; region: string }[]>(['volumes', 'list', '-a', app]) : [],
    secrets: exists ? json<{ Name?: string; name?: string }[]>(['secrets', 'list', '-a', app]).map(name) : [],
  };

  const p = plan({ app, region, adminEmail, signup, org: typeof f.org === 'string' ? f.org : undefined }, state);
  for (const e of p.errors) console.error(`Stop: ${e}`);
  if (p.errors.length) process.exit(1);
  for (const n of p.notes) console.log(`Note: ${n}`);
  console.log(`\nPlan for ${app} (${region}):`);
  p.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.say}`));
  if (f.plan === true) { console.log('\nOnly the plan (--plan): nothing was changed.'); return; }
  if (p.steps.some((s) => s.removes) && f.yes !== true) {
    if (!process.stdin.isTTY) { console.error('\nThis removes machines. Run again with --yes to allow it.'); process.exit(1); }
    if (ask('\nRemove the machines listed above? Type yes:') !== 'yes') { console.error('Stopped. Nothing was changed.'); process.exit(1); }
  }

  for (const [i, s] of p.steps.entries()) {
    console.log(`\n[${i + 1}/${p.steps.length}] ${s.say}`);
    const r = Bun.spawnSync([fly, ...s.args], { stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' });
    if (r.exitCode !== 0) { console.error(`\nStep ${i + 1} failed (fly ${s.args[0]}). Fix the problem above, then run the same command again.`); process.exit(1); }
  }

  const site = `https://${app}.fly.dev`;
  const ok = await fetch(`${site}/api/site`, { signal: AbortSignal.timeout(20000) }).then((r) => r.ok, () => false);
  console.log(`\n${ok ? 'Done. The site answers.' : 'Deployed, but the site did not answer yet. Open it in a minute.'}`);
  console.log(`  Site:            ${site}`);
  console.log(`  Make an account: ${site}/admin/signup${adminEmail ? ` (use ${adminEmail} to be the admin)` : ''}`);
  console.log('  Update later:    run the same command again.');
}

if (import.meta.main) await main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
