// Responses page (ResponseSummary, ResponseTable): stat tiles, Summary/Table tabs and CSV export.
import { createMemo, createResource, createSignal, For, Match, Show, Switch } from 'solid-js';
import { isQuestion, KIND_LABELS, type Answer, type Block, type FormDoc } from '../../shared/schema';
import { api } from '../api';
import { Icon } from '../ui/icons';
import { Empty, Loading, Seg } from '../ui/kit';
import { fmtDateTime, plural, TopBar } from './FormsList';
import { DATE_COL, headerCycle, headerToView, nextHeader, questionsOf, summarize, toCsv, viewRows, type ActiveHeader, type Bar, type HeaderState, type Resp, type Summary, type TextAnswer } from './report';
import { devTheme } from './appearance';
import { Link } from './router';
import SharePanel from './SharePanel';

type Data = { doc: FormDoc; responses: Resp[] };

const show = (a: Answer | undefined) => (a === undefined ? '' : Array.isArray(a) ? a.join(', ') : String(a));
const TEXT_PREVIEW = 5;
const STAR_PATH = 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z';

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return plural(Math.round(h / 24), 'day') + ' ago';
}

/** "Rating · 1–5", "Scale · 0–10", "Single choice" */
const typeLine = (q: Block) =>
  q.kind === 'rating' ? `Rating · 1–${q.max ?? 5}` : q.kind === 'scale' ? `Scale · ${q.min ?? 1}–${q.max ?? 10}` : KIND_LABELS[q.kind];

export default function Responses(props: { id: string }) {
  const [data] = createResource(() => props.id, (id) => api<Data>(`/forms/${id}/responses`));
  const [tab, setTab] = createSignal<'summary' | 'table'>('summary');
  const [sharing, setSharing] = createSignal(false);
  const questions = createMemo(() => (data() ? questionsOf(data()!.doc) : []));
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;

  function downloadCsv() {
    const d = data();
    if (!d) return;
    const blob = new Blob([toCsv(d.doc, d.responses)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(d.doc.title || 'form').replace(/[^\w-]+/g, '-').toLowerCase()}-responses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div class="fb-app" data-dev-theme={devTheme()} style={{ "min-height": "100vh" }}>
      <TopBar ticker={data() ? [data()!.doc.title || 'Untitled form', plural(data()!.responses.length, 'response'), 'Summary, table and CSV'] : undefined} />
      <main class="fb-wrap">
        <div style={{ display: 'flex', 'align-items': 'flex-end', gap: '16px', 'margin-bottom': '20px', 'flex-wrap': 'wrap' }}>
          <div style={{ flex: 1, display: 'flex', 'flex-direction': 'column', 'align-items': 'flex-start' }}>
            <Link href="/admin" class="fb-back"><Icon name="arrow-left" size="sm" />All forms</Link>
            <h1 class="fb-title" style={{ 'margin-top': '6px' }}>{data()?.doc.title ?? 'Form'} — responses</h1>
          </div>
          <Link href={`/admin/forms/${props.id}`} class="fb-btn fb-btn--secondary"><Icon name="pen" />Edit form</Link>
          <button class="fb-btn fb-btn--secondary" onClick={() => setSharing(true)}><Icon name="share" />Share</button>
        </div>
        <Switch fallback={<Loading text="Loading responses…" />}>
          <Match when={data.error}>
            <div class="fb-banner fb-banner--err" role="alert"><Icon name="alert" /><span>{data.error?.message}</span></div>
          </Match>
          <Match when={data()}>
            {(d) => (
              <>
                <div class="fb-stats">
                  <div class="fb-card fb-stat">
                    <span class="fb-cap">Total responses</span>
                    <div class="fb-n">{d().responses.length.toLocaleString('en-GB')}</div>
                    <span class="fb-help">+{d().responses.filter((r) => r.createdAt > weekAgo).length} this week</span>
                  </div>
                  <div class="fb-card fb-stat">
                    <span class="fb-cap">Latest response</span>
                    <div class="fb-n">{d().responses[0] ? ago(d().responses[0]!.createdAt) : '—'}</div>
                    <span class="fb-help">{d().responses[0] ? fmtDateTime(d().responses[0]!.createdAt) : 'No responses yet'}</span>
                  </div>
                </div>
                <Show
                  when={d().responses.length > 0}
                  fallback={
                    <div class="fb-card" style={{ 'margin-top': '24px' }}>
                      <Empty icon="inbox" title="No responses yet" text="Share the link or QR code. New answers appear here as they arrive.">
                        <button class="fb-btn fb-btn--primary" onClick={() => setSharing(true)}><Icon name="share" />Share form</button>
                      </Empty>
                    </div>
                  }
                >
                  <div class="fb-rtools">
                    <Seg label="View" value={tab()} onChange={setTab} options={[{ value: 'summary', label: 'Summary' }, { value: 'table', label: 'Table' }]} />
                    <span class="fb-sp" />
                    <button class="fb-btn fb-btn--secondary" onClick={downloadCsv}><Icon name="download" />Download CSV</button>
                  </div>
                  <Show when={tab() === 'summary'} fallback={<ResponseTable doc={d().doc} responses={d().responses} />}>
                    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
                      <For each={questions()}>{(q) => <QuestionSummary q={q} s={summarize(q, d().responses)} />}</For>
                    </div>
                  </Show>
                </Show>
              </>
            )}
          </Match>
        </Switch>
      </main>
      <Show when={sharing() && data()}>
        <SharePanel id={props.id} title={data()!.doc.title} onClose={() => setSharing(false)} />
      </Show>
    </div>
  );
}

function QuestionSummary(props: { q: Block; s: Summary }) {
  return (
    <section class="fb-card fb-qcard">
      <div class="fb-qcard-h">
        <h3>{props.q.label || 'Untitled question'}</h3>
        <span class="fb-cap">{typeLine(props.q)} · {plural(props.s.answered, 'answer')}</span>
      </div>
      <Switch>
        <Match when={props.s.answered === 0}><p class="fb-help">No answers yet.</p></Match>
        <Match when={props.s.type === 'choice' && props.s}>
          {(s) => (
            <>
              <Bars bars={s().bars} total={s().answered} />
              <Show when={s().multi}><p class="fb-help">People could pick more than one, so this is the % of respondents and can add up to more than 100%.</p></Show>
              <Show when={s().others.length}>
                <span class="fb-cap" style={{ 'text-transform': 'uppercase', 'letter-spacing': '.06em' }}>Typed under "{props.q.otherLabel?.trim() || 'Other'}"</span>
                <Answers values={s().others} />
              </Show>
            </>
          )}
        </Match>
        <Match when={props.s.type === 'scale' && props.s}>
          {(s) => (
            <>
              <div class="fb-avg">
                <span class="fb-big">{s().avg}</span>
                <span class="fb-of">out of {s().top}</span>
                <Show when={props.q.kind === 'rating'}>
                  <div class="fb-stars" style={{ 'margin-left': '6px', 'pointer-events': 'none' }} aria-hidden="true">
                    <For each={Array.from({ length: s().top }, (_, i) => i + 1)}>
                      {(n) => <span class="fb-star" classList={{ 'is-on': n <= Math.round(s().avg ?? 0) }}><svg viewBox="0 0 24 24"><path d={STAR_PATH} /></svg></span>}
                    </For>
                  </div>
                </Show>
              </div>
              <Bars bars={props.q.kind === 'rating' ? [...s().bars].reverse().map((b) => ({ ...b, label: `${b.label} ${b.label === '1' ? 'star' : 'stars'}` })) : s().bars} total={s().answered} />
              <div class="fb-lah">
                <div><span class="fb-cap">Lowest</span><b>{s().min}</b></div>
                <div><span class="fb-cap">Average</span><b>{s().avg}</b></div>
                <div><span class="fb-cap">Highest</span><b>{s().max}</b></div>
              </div>
            </>
          )}
        </Match>
        <Match when={props.s.type === 'number' && props.s}>
          {(s) => (
            <div class="fb-lah">
              <div><span class="fb-cap">Lowest</span><b>{s().min}</b></div>
              <div><span class="fb-cap">Average</span><b>{s().avg}</b></div>
              <div><span class="fb-cap">Highest</span><b>{s().max}</b></div>
            </div>
          )}
        </Match>
        <Match when={props.s.type === 'text' && props.s}>{(s) => <Answers values={s().values} />}</Match>
      </Switch>
    </section>
  );
}

/** Newest text answers with timestamps; "Show all" expands inline. */
function Answers(props: { values: TextAnswer[] }) {
  const [all, setAll] = createSignal(false);
  return (
    <>
      <ul class="fb-answers">
        <For each={all() ? props.values : props.values.slice(0, TEXT_PREVIEW)}>
          {(v) => <li style={{ 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere' }}>{v.text}<time datetime={new Date(v.at).toISOString()}>{fmtDateTime(v.at)}</time></li>}
        </For>
      </ul>
      <Show when={props.values.length > TEXT_PREVIEW}>
        <div><button class="fb-btn fb-btn--ghost fb-btn--sm" onClick={() => setAll(!all())}>{all() ? 'Show fewer' : `Show all ${props.values.length}`}</button></div>
      </Show>
    </>
  );
}

/** Horizontal bars in option order; the most-picked label is bold; count and % are written out. */
function Bars(props: { bars: Bar[]; total: number }) {
  const top = () => Math.max(0, ...props.bars.map((b) => b.count));
  return (
    <ul class="fb-bars">
      <For each={props.bars}>
        {(b) => (
          <li class="fb-bar" classList={{ 'is-top': b.count > 0 && b.count === top() }}>
            <span class="fb-bar-l">{b.label}</span>
            <span class="fb-bar-t" role="img" aria-label={`${b.count} of ${props.total}`}><span style={{ width: `${b.pct}%` }} /></span>
            <span class="fb-bar-n">{b.count}<small>{Math.round(b.pct)}%</small></span>
          </li>
        )}
      </For>
    </ul>
  );
}

/** The words for a header state, as shown in the header and the status line. */
function stateWords(col: string, q: Block | undefined, st: HeaderState): string {
  const num = q && ['number', 'rating', 'scale'].includes(q.kind);
  switch (st.kind) {
    case 'asc': return col === DATE_COL ? 'Oldest first' : num ? 'Low to high' : 'A to Z';
    case 'desc': return col === DATE_COL ? 'Newest first' : num ? 'High to low' : 'Z to A';
    case 'value': return `Only "${st.value}"`;
    case 'answered': return 'Answered only';
    case 'empty': return 'No answer only';
  }
}

/** Table tab: one section at a time. Each click on a column title moves it to its next sort or filter; one column at a time. */
function ResponseTable(props: { doc: FormDoc; responses: Resp[] }) {
  // Sections that hold questions; each gets its own table view.
  const sections = createMemo(() =>
    props.doc.sections
      .map((sec, i) => ({ id: sec.id, name: sec.title?.trim() || `Section ${i + 1}`, questions: sec.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks.filter(isQuestion))) }))
      .filter((sec) => sec.questions.length > 0),
  );
  const [sectionId, setSectionId] = createSignal(sections()[0]?.id ?? '');
  const questions = createMemo(() => sections().find((sec) => sec.id === sectionId())?.questions ?? sections()[0]?.questions ?? []);
  const [search, setSearch] = createSignal('');
  const [active, setActive] = createSignal<ActiveHeader>(null);
  const pickSection = (id: string) => { setSectionId(id); setActive(null); };

  const qById = (id: string) => questions().find((q) => q.id === id);
  const cycleOf = (col: string) => headerCycle(col, qById(col), props.responses);
  const click = (col: string) => setActive((a) => nextHeader(a, col, cycleOf(col)));
  const rows = createMemo(() => {
    const f = search().trim().toLowerCase();
    const searched = f ? props.responses.filter((r) => questions().some((q) => show(r.answers[q.id]).toLowerCase().includes(f))) : props.responses;
    return viewRows(searched, questions(), headerToView(active()));
  });
  const numeric = (q: Block) => q.kind === 'number' || q.kind === 'rating' || q.kind === 'scale';
  const stateOf = (col: string) => (active()?.col === col ? active()!.state : null);
  const colName = (col: string) => (col === DATE_COL ? 'Submitted' : qById(col)?.label || 'Untitled question');

  const Head = (p: { col: string; title: string; sub: string }) => {
    const st = () => stateOf(p.col);
    const next = () => {
      const after = nextHeader(active(), p.col, cycleOf(p.col));
      return after ? stateWords(p.col, qById(p.col), after.state) : 'Off';
    };
    return (
      <th scope="col" aria-sort={st()?.kind === 'asc' ? 'ascending' : st()?.kind === 'desc' ? 'descending' : undefined}>
        <button type="button" class="fb-th-btn" classList={{ 'is-on': !!st() }} onClick={() => click(p.col)}
          title={`Click: ${next()}`}>
          <span>
            {p.title}
            <small>{st() ? stateWords(p.col, qById(p.col), st()!) : p.sub}</small>
          </span>
          <span class="fb-th-ic" classList={{ on: !!st() }} aria-hidden="true">
            <Show when={st()} fallback={<Icon name="sort" size="sm" />}>
              {(x) => (x().kind === 'asc' || x().kind === 'desc'
                ? <Icon name="chev-down" size="sm" class={x().kind === 'asc' ? 'fb-flip' : undefined} />
                : <Icon name="filter" size="sm" />)}
            </Show>
          </span>
          <span class="fb-sr">. Next click: {next()}.</span>
        </button>
      </th>
    );
  };

  return (
    <>
      <Show when={sections().length > 1}>
        <div class="fb-rtools" style={{ 'margin-top': 0 }}>
          <Seg label="Section" value={sectionId()} onChange={pickSection} options={sections().map((sec) => ({ value: sec.id, label: sec.name }))} />
        </div>
      </Show>
      <div class="fb-rtools" style={{ 'margin-top': 0 }}>
        <div class="fb-search" style={{ width: '320px', 'max-width': '100%' }}>
          <Icon name="search" />
          <input class="fb-input" type="search" placeholder="Search answers" aria-label="Search answers" value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
        </div>
        <span class="fb-help fb-num" role="status">
          {rows().length === props.responses.length ? plural(props.responses.length, 'response') : `${rows().length} of ${plural(props.responses.length, 'response')}`}
        </span>
        <span class="fb-sp" />
        <Show when={active()} fallback={<span class="fb-help">Click a column title to sort, click again to filter.</span>}>
          {(a) => (
            <button type="button" class="fb-chip" onClick={() => setActive(null)} aria-label={`Clear: ${colName(a().col)}, ${stateWords(a().col, qById(a().col), a().state)}`}>
              <Icon name={a().state.kind === 'asc' || a().state.kind === 'desc' ? 'sort' : 'filter'} size="sm" />
              {colName(a().col)}: {stateWords(a().col, qById(a().col), a().state)}<Icon name="x" size="sm" />
            </button>
          )}
        </Show>
      </div>
      <div class="fb-table-wrap" style={{ 'max-height': 'calc(100dvh - 330px)', 'min-height': '240px' }}>
        <table class="fb-table">
          <thead>
            <tr>
              <th class="fb-rn" scope="col">#</th>
              <Head col={DATE_COL} title="Submitted" sub="Date" />
              <For each={questions()}>{(q) => <Head col={q.id} title={q.label || 'Untitled question'} sub={typeLine(q)} />}</For>
            </tr>
          </thead>
          <tbody>
            <For each={rows()} fallback={<tr><td colSpan={questions().length + 2}><p class="fb-help" style={{ padding: '16px 0' }}>No responses match. Click the column title again, or clear the filter.</p></td></tr>}>
              {(r) => (
                <tr>
                  <td class="fb-rn">{props.responses.length - props.responses.indexOf(r)}</td>
                  <td style={{ 'white-space': 'nowrap' }}>{fmtDateTime(r.createdAt)}</td>
                  <For each={questions()}>
                    {(q) => {
                      const v = show(r.answers[q.id]);
                      return (
                        <td classList={{ 'fb-num': numeric(q) }} title={v.length > 60 ? v : undefined}
                          style={{ 'max-width': '280px', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                          {v || <span class="fb-dash" aria-label="No answer">—</span>}
                        </td>
                      );
                    }}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </>
  );
}
