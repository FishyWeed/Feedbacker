import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { api, SIGNED_OUT } from '../api';
import { Icon } from '../ui/icons';
import { Brand, Empty, Loading, MenuButton, Modal, Ticker } from '../ui/kit';
import { devTheme, showTicker } from './appearance';
import { Link, navigate } from './router';
import SharePanel from './SharePanel';

type FormRow = { id: string; title: string; createdAt: number; updatedAt: number; publishedAt: number | null; unpublished: boolean; responses: number };

const SORTS = [
  { value: 'updated', label: 'Last updated' },
  { value: 'created', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'az', label: 'Name A–Z' },
  { value: 'za', label: 'Name Z–A' },
  { value: 'responses', label: 'Most responses' },
] as const;
const FILTERS = [
  { value: 'all', label: 'All forms' },
  { value: 'live', label: 'Live' },
  { value: 'changes', label: 'Unpublished changes' },
  { value: 'draft', label: 'Not published' },
  { value: 'answered', label: 'Has responses' },
] as const;
type Sort = (typeof SORTS)[number]['value'];
type Filter = (typeof FILTERS)[number]['value'];
const byName = (a: FormRow, b: FormRow) => (a.title || 'Untitled form').localeCompare(b.title || 'Untitled form', undefined, { sensitivity: 'base', numeric: true });
const SORT_FN: Record<Sort, (a: FormRow, b: FormRow) => number> = {
  updated: (a, b) => b.updatedAt - a.updatedAt,
  created: (a, b) => b.createdAt - a.createdAt,
  oldest: (a, b) => a.createdAt - b.createdAt,
  az: byName,
  za: (a, b) => byName(b, a),
  responses: (a, b) => b.responses - a.responses || b.updatedAt - a.updatedAt,
};
const FILTER_FN: Record<Filter, (f: FormRow) => boolean> = {
  all: () => true,
  live: (f) => f.publishedAt !== null && !f.unpublished,
  changes: (f) => f.unpublished,
  draft: (f) => f.publishedAt === null,
  answered: (f) => f.responses > 0,
};
// Sort and filter choices stay between visits (per browser).
const remembered = <T extends string>(key: string, fallback: T, allowed: readonly { value: T }[]): T => {
  try { const v = localStorage.getItem(key) as T | null; return v && allowed.some((o) => o.value === v) ? v : fallback; } catch { return fallback; }
};
const remember = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* not saved: private mode */ } };

export const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export async function signOut() {
  await api('/logout', 'POST').catch(() => {});
  window.dispatchEvent(new Event(SIGNED_OUT));
}

/** Owner top bar. Sign out lives at the bottom of Settings. */
/** Owner top bar. `ticker`: facts for the status ticker under it (Arcade and Paper dev themes only). */
export function TopBar(props: { ticker?: string[] }) {
  return (
    <>
      <header class="fb-top">
        <Brand />
        <span class="fb-top-sp" />
        <Link href="/admin/settings" class="fb-btn fb-btn--secondary fb-btn--sm">Settings</Link>
      </header>
      <Show when={showTicker() && props.ticker?.length}><Ticker items={props.ticker!} /></Show>
    </>
  );
}

export default function FormsList() {
  const [forms, { refetch }] = createResource(() => api<FormRow[]>('/forms'));
  const [error, setError] = createSignal('');
  const [creating, setCreating] = createSignal(false);
  const [sharing, setSharing] = createSignal<FormRow | null>(null);
  const [deleting, setDeleting] = createSignal<FormRow | null>(null);
  const [busyDelete, setBusyDelete] = createSignal(false);
  const [sort, setSortRaw] = createSignal<Sort>(remembered('fb-forms-sort', 'updated', SORTS));
  const [filter, setFilterRaw] = createSignal<Filter>(remembered('fb-forms-filter', 'all', FILTERS));
  const setSort = (v: Sort) => { setSortRaw(v); remember('fb-forms-sort', v); };
  const setFilter = (v: Filter) => { setFilterRaw(v); remember('fb-forms-filter', v); };
  const total = () => (forms() ?? []).reduce((n, f) => n + f.responses, 0);
  const shown = createMemo(() => (forms() ?? []).filter(FILTER_FN[filter()]).sort(SORT_FN[sort()]));

  /** Creates "Untitled form" and opens it; the owner names it in the editor. */
  async function create() {
    setCreating(true);
    try {
      const { id } = await api<{ id: string }>('/forms', 'POST', {});
      navigate(`/admin/forms/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The form was not created. Try again.');
    } finally {
      setCreating(false);
    }
  }

  async function remove() {
    const f = deleting();
    if (!f) return;
    setBusyDelete(true);
    try {
      await api(`/forms/${f.id}`, 'DELETE');
      setDeleting(null);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The form was not deleted. Try again.');
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <div class="fb-app" data-dev-theme={devTheme()} style={{ "min-height": "100vh" }}>
      <TopBar ticker={forms() ? [
        plural(forms()!.length, 'form'),
        `${forms()!.filter((f) => f.publishedAt !== null).length} live`,
        `${forms()!.filter((f) => f.unpublished && f.publishedAt !== null).length} with unpublished changes`,
        `${plural(total(), 'response')} in total`,
      ] : undefined} />
      <main class="fb-wrap">
        <div class="fb-list-head">
          <div>
            <h1 class="fb-title">Your forms</h1>
            <Show when={forms()}>
              <p class="fb-help" style={{ 'margin-top': '4px' }}>{plural(forms()!.length, 'form')} · {plural(total(), 'response')} in total</p>
            </Show>
          </div>
          <span class="fb-sp" />
          <Show when={(forms() ?? []).length > 0}>
            <MenuButton label="Show" icon="filter" value={filter()} options={FILTERS} onChange={setFilter} />
            <MenuButton label="Sort" icon="sort" value={sort()} options={SORTS} onChange={setSort} />
          </Show>
          <button class="fb-btn fb-btn--primary" classList={{ 'is-loading': creating() }} aria-busy={creating()} onClick={create}>
            <Show when={creating()} fallback={<Icon name="plus" />}><span class="fb-spin" aria-hidden="true" /></Show>Create form
          </button>
        </div>
        <Show when={error()}>
          <div class="fb-banner fb-banner--err" role="alert" style={{ 'margin-top': '16px' }}><Icon name="alert" /><span>{error()}</span></div>
        </Show>
        <Show when={forms()} fallback={<Loading text="Loading forms…" />}>
          <Show
            when={forms()!.length > 0}
            fallback={
              <div class="fb-card" style={{ 'margin-top': '24px' }}>
                <Empty icon="inbox" title="No forms yet" text="Create your first form. You can name it and change everything in the editor." />
              </div>
            }
          >
            <Show when={shown().length === 0}>
              <div class="fb-card" style={{ 'margin-top': '24px' }}>
                <Empty icon="filter" title="Nothing matches" text={`No forms are "${FILTERS.find((f) => f.value === filter())!.label}".`}>
                  <button class="fb-btn fb-btn--secondary" onClick={() => setFilter('all')}>Show all forms</button>
                </Empty>
              </div>
            </Show>
            <div class="fb-forms">
              <For each={shown()}>
                {(f) => (
                  <article class="fb-card fb-card--hover fb-fcard">
                    <h3><Link href={`/admin/forms/${f.id}`} style={{ color: 'inherit', 'text-decoration': 'none' }}>{f.title || 'Untitled form'}</Link></h3>
                    <p class="fb-meta" style={{ margin: 0 }}>{plural(f.responses, 'response')} · Updated {fmtDate(f.updatedAt)}</p>
                    <div class="fb-fcard-status">
                      <Show when={f.publishedAt !== null} fallback={<span class="fb-badge fb-badge--type"><Icon name="pen" />Not published</span>}>
                        <Show when={f.unpublished} fallback={<span class="fb-badge fb-badge--ok"><Icon name="check" />Live</span>}>
                          <span class="fb-badge fb-badge--warn"><Icon name="warn" />Unpublished changes</span>
                        </Show>
                      </Show>
                    </div>
                    <div class="fb-acts">
                      <Link href={`/admin/forms/${f.id}`} class="fb-btn fb-btn--secondary fb-btn--sm"><Icon name="pen" size="sm" />Edit</Link>
                      <Link href={`/admin/forms/${f.id}/responses`} class="fb-btn fb-btn--secondary fb-btn--sm"><Icon name="inbox" size="sm" />Responses</Link>
                      <span class="fb-sp" />
                      <button class="fb-btn fb-btn--ghost fb-btn--sm fb-btn--icon" aria-label={`Share ${f.title || 'Untitled form'}`} title="Share" onClick={() => setSharing(f)}>
                        <Icon name="share" size="sm" />
                      </button>
                      <button class="fb-btn fb-btn--danger-ghost fb-btn--sm fb-btn--icon" aria-label={`Delete ${f.title || 'Untitled form'}`} onClick={() => setDeleting(f)}>
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                  </article>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </main>
      {/* keyed: the dialog gets a plain value, so closing it never reads a value that is already gone */}
      <Show when={sharing()} keyed>{(f) => <SharePanel id={f.id} title={f.title} published={f.publishedAt !== null} onClose={() => setSharing(null)} />}</Show>
      <Show when={deleting()} keyed>
        {(f) => (
          <Modal
            title={`Delete "${f.title || 'Untitled form'}"?`}
            onClose={() => setDeleting(null)}
            footer={
              <>
                <button class="fb-btn fb-btn--ghost" onClick={() => setDeleting(null)}>Cancel</button>
                <button class="fb-btn fb-btn--danger" classList={{ 'is-loading': busyDelete() }} aria-busy={busyDelete()} onClick={remove}>
                  <Show when={busyDelete()} fallback={<Icon name="trash" />}><span class="fb-spin" aria-hidden="true" /></Show>Delete form
                </button>
              </>
            }
          >
            <p style={{ margin: 0 }}>This deletes the form and its <b class="fb-num">{plural(f.responses, 'response')}</b>. You can't undo this.</p>
          </Modal>
        )}
      </Show>
    </div>
  );
}
