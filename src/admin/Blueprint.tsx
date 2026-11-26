// Blueprint view: the form as a circuit. Every section (page) is a node; flow lines join the pages in order, from Start
// to the thank-you page. A page or question with a condition gets a dashed line labeled with its rule, and an
// "Otherwise" line shows the skip. Click a line, node or question to edit its condition in the side panel.
// Nodes move freely (drag, or arrow keys); positions are part of the draft, so Save draft keeps them.
import { createMemo, createSignal, For, Show, onCleanup, onMount } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { ruleText } from '../../shared/logic';
import { isQuestion, KIND_LABELS, type Block, type Section } from '../../shared/schema';
import { Icon, KIND_ICON } from '../ui/icons';
import { locate, useEditor } from './editorStore';
import { RuleEditor } from './Inspector';

const NODE_W = 280;
const GAP_X = 200; // room for a condition label above the line
const PORT_Y = 26; // flow lines meet a node at the middle of its header
const MOVE_PX = 20; // arrow-key step (Shift: 3 steps)

type Pt = { x: number; y: number };
type Edge = { key: string; d: string; kind: 'flow' | 'cond' | 'bypass'; mid: Pt; target?: Section; page?: number };

/** A cubic curve between two ports; `dip` bends it down (for the "Otherwise" skip). Returns the path and its middle. */
function curve(a: Pt, b: Pt, dip = 0): { d: string; mid: Pt } {
  const dx = Math.max(60, Math.abs(b.x - a.x) / 2);
  const c1 = { x: a.x + dx, y: a.y + dip };
  const c2 = { x: b.x - dx, y: b.y + dip };
  return {
    d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    mid: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 },
  };
}

export default function Blueprint() {
  const ed = useEditor();
  const [drag, setDrag] = createSignal<{ id: string; x: number; y: number } | null>(null);
  // Node heights, measured, so an "Otherwise" line can pass below the nodes it skips.
  const [heights, setHeights] = createSignal<Record<string, number>>({});
  const sizes = new ResizeObserver((entries) => setHeights((h) => {
    const next = { ...h };
    for (const e of entries) next[(e.target as HTMLElement).dataset.id!] = (e.target as HTMLElement).offsetHeight;
    return next;
  }));
  onCleanup(() => sizes.disconnect());
  const measure = (el: HTMLElement) => sizes.observe(el);

  const auto = (i: number): Pt => ({ x: 160 + i * (NODE_W + GAP_X), y: 90 });
  const posOf = (s: Section, i: number): Pt => { const d = drag(); return d?.id === s.id ? d : s.pos ?? auto(i); };
  const positions = createMemo(() => ed.doc.sections.map(posOf));
  const last = () => positions()[positions().length - 1] ?? { x: 160, y: 90 };
  const start = (): Pt => { const p = positions()[0] ?? auto(0); return { x: Math.max(8, p.x - 120), y: p.y + PORT_Y }; };
  const end = (): Pt => ({ x: last().x + NODE_W + GAP_X / 2 + 20, y: last().y + PORT_Y });
  const size = createMemo(() => ({
    w: Math.max(...positions().map((p) => p.x), 0) + NODE_W + GAP_X + 240,
    h: Math.max(...positions().map((p) => p.y), 0) + 1000,
  }));

  const edges = createMemo<Edge[]>(() => {
    const secs = ed.doc.sections;
    const ps = positions();
    const outOf = (i: number): Pt => (i < 0 ? { x: start().x + 64, y: start().y } : { x: ps[i]!.x + NODE_W, y: ps[i]!.y + PORT_Y });
    const into = (i: number): Pt => (i >= secs.length ? { x: end().x, y: end().y } : { x: ps[i]!.x, y: ps[i]!.y + PORT_Y });
    const bottom = (i: number) => (secs[i] ? ps[i]!.y + (heights()[secs[i]!.id] ?? 200) : 0);
    const out: Edge[] = [];
    for (let i = 0; i <= secs.length; i++) {
      const target = secs[i];
      const c = curve(outOf(i - 1), into(i));
      out.push({ key: `f${i}`, ...c, kind: target?.showIf ? 'cond' : 'flow', target, page: i + 1 });
      // A conditional page can be skipped: the flow then goes from the page before it to the page after it, below
      // the nodes in between (a cubic curve reaches 3/4 of its control offset, hence the / 0.75).
      if (target?.showIf) {
        const a = outOf(i - 1);
        const low = Math.max(bottom(i - 1), bottom(i), bottom(i + 1)) + 36;
        out.push({ key: `b${i}`, ...curve(a, into(i + 1), Math.max(40, (low - a.y) / 0.75)), kind: 'bypass' });
      }
    }
    return out;
  });

  // --- Moving nodes: drag the header (positions commit on release, as one undo step), or arrow keys. ---
  function pressNode(s: Section, i: number, e: PointerEvent) {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    const from = posOf(s, i);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      setDrag({ id: s.id, x: Math.max(0, from.x + dx), y: Math.max(0, from.y + dy) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = drag();
      if (moved && d) ed.actions.updateSection(s.id, { pos: { x: Math.round(d.x), y: Math.round(d.y) } });
      setDrag(null);
      if (!moved) ed.select(s.id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  const ARROWS: Record<string, Pt> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
  function keyNode(s: Section, i: number, e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ed.select(s.id); return; }
    const a = ARROWS[e.key];
    if (!a) return;
    e.preventDefault();
    const p = posOf(s, i);
    const step = e.shiftKey ? MOVE_PX * 3 : MOVE_PX;
    ed.actions.updateSection(s.id, { pos: { x: Math.max(0, p.x + a.x * step), y: Math.max(0, p.y + a.y * step) } });
  }

  // Undo and redo here too (the Edit view's shortcuts are not mounted in this view).
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'y') { e.preventDefault(); if (k === 'y' || e.shiftKey) ed.history.redo(); else ed.history.undo(); }
  };
  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  const label = (b: Block) => b.label?.trim() || KIND_LABELS[b.kind];
  const sel = () => ed.selected();

  return (
    <div class="fb-bpv">
      <div class="fb-bpv-stage" onClick={(e) => e.target === e.currentTarget && ed.select(null)}>
        <div class="fb-bpv-tools">
          <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" disabled={!ed.doc.sections.some((s) => s.pos)}
            onClick={() => ed.actions.clearPositions()} title="Put every page back in a row, in page order">
            <Icon name="columns" size="sm" />Auto layout
          </button>
          <span class="fb-bpv-legend" aria-hidden="true"><i class="is-flow" />Next page<i class="is-cond" />Only if<i class="is-bypass" />Otherwise</span>
        </div>
        <div class="fb-bpv-world" style={{ width: `${size().w}px`, height: `${size().h}px` }} onClick={(e) => e.target === e.currentTarget && ed.select(null)}>
          <svg class="fb-bpv-lines" width={size().w} height={size().h} aria-hidden="true">
            <defs>
              <For each={['flow', 'cond', 'bypass']}>
                {(k) => <marker id={`fb-bpv-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class={`fb-bpv-arrow is-${k}`} /></marker>}
              </For>
            </defs>
            <For each={edges()}>{(e) => <path d={e.d} class={`fb-bpv-edge is-${e.kind}`} marker-end={`url(#fb-bpv-arrow-${e.kind})`} />}</For>
          </svg>

          {/* Line labels: a condition to edit, an "add condition" spot, or "Otherwise". */}
          <For each={edges()}>
            {(e) => (
              <Show when={e.kind === 'bypass'} fallback={
                <Show when={e.target} keyed>
                  {(t) => (
                    <Show when={t.showIf} keyed fallback={
                      <Show when={e.page! > 1}>
                        <button type="button" class="fb-bpv-add" style={{ left: `${e.mid.x}px`, top: `${e.mid.y}px` }}
                          aria-label={`Add a condition to page ${e.page}`} title="Show this page only if…" onClick={() => ed.select(t.id)}>
                          <Icon name="plus" size="sm" />
                        </button>
                      </Show>
                    }>
                      {(rule) => (
                        <button type="button" class="fb-bpv-cond" classList={{ 'is-on': sel() === t.id }} style={{ left: `${e.mid.x}px`, top: `${e.mid.y}px` }}
                          title={`${ruleText(rule, ed.doc)}. Click to change.`} onClick={() => ed.select(t.id)}>
                          <Icon name="branch" size="sm" /><span>{ruleText(rule, ed.doc)}</span>
                        </button>
                      )}
                    </Show>
                  )}
                </Show>
              }>
                <span class="fb-bpv-else" style={{ left: `${e.mid.x}px`, top: `${e.mid.y}px` }}>Otherwise</span>
              </Show>
            )}
          </For>

          <span class="fb-bpv-term" style={{ left: `${start().x}px`, top: `${start().y}px` }}>Start</span>
          <span class="fb-bpv-term" style={{ left: `${end().x}px`, top: `${end().y}px` }}>Thank-you page</span>

          <For each={ed.doc.sections}>
            {(s, i) => (
              <section ref={measure} data-id={s.id} class="fb-bpv-node" classList={{ 'is-selected': sel() === s.id, 'is-dragging': drag()?.id === s.id, 'is-cond': !!s.showIf }}
                style={{ left: `${posOf(s, i()).x}px`, top: `${posOf(s, i()).y}px`, width: `${NODE_W}px` }} aria-label={`Page ${i() + 1}`}>
                <header class="fb-bpv-node-h" tabIndex={0} role="button"
                  aria-label={`Page ${i() + 1}${s.title ? `: ${s.title}` : ''}. Arrow keys move it; Enter selects it.`}
                  onPointerDown={(e) => pressNode(s, i(), e)} onKeyDown={(e) => keyNode(s, i(), e)}>
                  <Icon name="grip" size="sm" />
                  <span class="fb-bpv-page">Page {i() + 1}</span>
                  <b>{s.title?.trim() || `Section ${i() + 1}`}</b>
                  <Show when={s.showIf}><span class="fb-badge fb-badge--cond"><Icon name="branch" />If</span></Show>
                </header>
                {/* The internal circuit: down through each row, across each row's columns. */}
                <div class="fb-bpv-flow">
                  <Show when={s.rows.some((r) => r.columns.some((c) => c.blocks.length))} fallback={<p class="fb-bpv-empty">No blocks yet</p>}>
                    <For each={s.rows}>
                      {(r) => (
                        <div class="fb-bpv-row" style={{ '--n': r.columns.length }}>
                          <For each={r.columns}>
                            {(c) => (
                              <div class="fb-bpv-col">
                                <For each={c.blocks}>
                                  {(b) => (
                                    <button type="button" class="fb-bpv-el" classList={{ 'is-q': isQuestion(b), 'is-cond': !!b.showIf, 'is-selected': sel() === b.id }}
                                      title={b.showIf ? `${label(b)} — ${ruleText(b.showIf, ed.doc)}` : label(b)} onClick={() => ed.select(b.id)}>
                                      <Icon name={KIND_ICON[b.kind]} size="sm" /><span>{label(b)}</span>
                                      <Show when={b.showIf} keyed>{(rule) => <small><Icon name="branch" size="sm" />{ruleText(rule, ed.doc)}</small>}</Show>
                                    </button>
                                  )}
                                </For>
                              </div>
                            )}
                          </For>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </section>
            )}
          </For>
        </div>
      </div>
      <BlueprintPanel />
    </div>
  );
}

/** The side panel: when the selected page or question shows. */
function BlueprintPanel() {
  const ed = useEditor();
  const target = createMemo(() => { const id = ed.selected(); return id ? locate(unwrap(ed.doc), id) : null; });
  return (
    <aside class="fb-insp fb-bpv-panel" aria-label="Condition">
      <Show when={target()} fallback={
        <div class="fb-insp-s">
          <div class="fb-insp-t">Blueprint</div>
          <p class="fb-help">Each node is a page. Lines show the order visitors go through. A dashed line means the page shows only
            if its condition is true; the "Otherwise" line shows where visitors go when it is not.</p>
          <p class="fb-help">Select a line, a page or a question to set when it shows. Drag pages to arrange them; Save draft keeps
            the layout.</p>
        </div>
      }>
        {(t) => (
          <Show when={t().block} fallback={
            <Show when={!t().row && t().section} keyed>
              {(s) => {
                const index = () => ed.doc.sections.findIndex((x) => x.id === s.id);
                return (
                  <>
                    <div class="fb-insp-s">
                      <div class="fb-insp-t">Page {index() + 1}</div>
                      <p class="fb-help">{s.title?.trim() || `Section ${index() + 1}`}</p>
                    </div>
                    <RuleEditor targetId={s.id} rule={s.showIf} subject="section" onChange={(showIf) => ed.actions.updateSection(s.id, { showIf })} />
                  </>
                );
              }}
            </Show>
          }>
            {(b) => (
              <>
                <div class="fb-insp-s">
                  <div class="fb-insp-t">{KIND_LABELS[b().kind]}</div>
                  <p class="fb-help">{b().label?.trim() || 'No label'}</p>
                </div>
                <RuleEditor targetId={b().id} rule={b().showIf} subject="question" onChange={(showIf) => ed.actions.updateBlock(b().id, { showIf })} />
              </>
            )}
          </Show>
        )}
      </Show>
    </aside>
  );
}
