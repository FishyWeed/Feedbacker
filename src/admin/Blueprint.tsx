// Blueprint view: the form as a circuit on a free board. Every section (page) is a node; flow lines join the pages in
// order, from Start to the thank-you page. A page or question with a condition gets a dashed line labeled with its
// rule, and an "Otherwise" line shows the skip.
//
// - Board: no scrollbars. Hold the right (or middle) mouse button to pan, or use the wheel. "Center" brings it back.
// - Nodes: drag by the header, or arrow keys. Lines: drag the middle (label or "+") to bend; double-click to straighten.
// - Question ports: click the dot beside a question, pick an answer, then pull the wire to a later question or page:
//   that target shows only for that answer. Page ports: add a page before or after, or wire to another page to make
//   it come next.
// Positions and bends are part of the draft, so Save draft keeps them; every change is one undo step.
import { createEffect, createMemo, createSignal, For, Show, onCleanup, onMount } from 'solid-js';
import { canUseQuestion, ruleText, withCondition } from '../../shared/logic';
import { isQuestion, KIND_LABELS, optionsOf, type Block, type Condition, type Section } from '../../shared/schema';
import { Icon, KIND_ICON } from '../ui/icons';
import { locate, useEditor } from './editorStore';
import { RuleEditor } from './Inspector';

const NODE_W = 280;
const GAP_X = 200; // room for a condition label above the line
const PORT_Y = 26; // flow lines meet a node at the middle of its header
const MOVE_PX = 20; // arrow-key step (Shift: 3 steps)

type Pt = { x: number; y: number };
type Edge = { key: string; d: string; kind: 'flow' | 'cond' | 'bypass'; mid: Pt; target?: Section; page?: number };
type Menu = { kind: 'q'; blockId: string; at: Pt } | { kind: 'out' | 'in'; sectionId: string; at: Pt };
type Wire = { kind: 'cond'; from: string; cond: Condition; text: string; at: Pt } | { kind: 'page'; from: string; at: Pt };

/**
 * A cubic curve between two ports. `dip` bends it down (the "Otherwise" skip); `bend` moves its middle by that much
 * (a cubic's middle moves 3/4 of its control points, hence / 0.75). Returns the path and its middle.
 */
function curve(a: Pt, b: Pt, dip = 0, bend: Pt = { x: 0, y: 0 }): { d: string; mid: Pt } {
  const dx = Math.max(60, Math.abs(b.x - a.x) / 2);
  const c1 = { x: a.x + dx + bend.x / 0.75, y: a.y + dip + bend.y / 0.75 };
  const c2 = { x: b.x - dx + bend.x / 0.75, y: b.y + dip + bend.y / 0.75 };
  return {
    d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    mid: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 },
  };
}

/** The answers a wire can stand for, per question type. */
function choicesFor(b: Block): { label: string; cond: Condition }[] {
  const q = b.id;
  const out: { label: string; cond: Condition }[] = [];
  if (['single_choice', 'dropdown', 'yes_no'].includes(b.kind)) for (const o of optionsOf(b)) out.push({ label: `is "${o}"`, cond: { q, op: 'equals', value: o } });
  if (b.kind === 'multi_choice') for (const o of optionsOf(b)) out.push({ label: `includes "${o}"`, cond: { q, op: 'contains', value: o } });
  out.push({ label: 'is answered', cond: { q, op: 'answered' } }, { label: 'is not answered', cond: { q, op: 'not_answered' } });
  return out;
}

export default function Blueprint() {
  const ed = useEditor();
  const [pan, setPan] = createSignal<Pt>({ x: 0, y: 0 });
  const [drag, setDrag] = createSignal<{ id: string; x: number; y: number } | null>(null);
  const [bendDrag, setBendDrag] = createSignal<{ id: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = createSignal<Menu | null>(null);
  const [wire, setWire] = createSignal<Wire | null>(null);
  const [cursor, setCursor] = createSignal<Pt>({ x: 0, y: 0 });
  const [note, setNote] = createSignal('');
  let stage!: HTMLDivElement;
  const toWorld = (cx: number, cy: number): Pt => { const r = stage.getBoundingClientRect(); return { x: cx - r.left - pan().x, y: cy - r.top - pan().y }; };
  const centerOf = (el: Element): Pt => { const r = el.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };

  // Node heights, measured, so an "Otherwise" line can pass below the nodes it skips.
  const [heights, setHeights] = createSignal<Record<string, number>>({});
  const sizes = new ResizeObserver((entries) => setHeights((h) => {
    const next = { ...h };
    for (const e of entries) next[(e.target as HTMLElement).dataset.bpvSection!] = (e.target as HTMLElement).offsetHeight;
    return next;
  }));
  onCleanup(() => sizes.disconnect());
  const measure = (el: HTMLElement) => sizes.observe(el);

  const auto = (i: number): Pt => ({ x: 160 + i * (NODE_W + GAP_X), y: 90 });
  const posOf = (s: Section, i: number): Pt => { const d = drag(); return d?.id === s.id ? d : s.pos ?? auto(i); };
  const bendOf = (s: Section): Pt => { const b = bendDrag(); return b?.id === s.id ? b : s.bend ?? { x: 0, y: 0 }; };
  const positions = createMemo(() => ed.doc.sections.map(posOf));
  const last = () => positions()[positions().length - 1] ?? { x: 160, y: 90 };
  const start = (): Pt => { const p = positions()[0] ?? auto(0); return { x: p.x - 120, y: p.y + PORT_Y }; };
  const end = (): Pt => ({ x: last().x + NODE_W + GAP_X / 2 + 20, y: last().y + PORT_Y });

  const edges = createMemo<Edge[]>(() => {
    const secs = ed.doc.sections;
    const ps = positions();
    // Lines leave from the outer edge of a page's right dot and arrive at the outer edge of the next page's left dot.
    const outOf = (i: number): Pt => (i < 0 ? { x: start().x + 64, y: start().y } : { x: ps[i]!.x + NODE_W + 8, y: ps[i]!.y + PORT_Y });
    const into = (i: number): Pt => (i >= secs.length ? { x: end().x, y: end().y } : { x: ps[i]!.x - 8, y: ps[i]!.y + PORT_Y });
    const bottom = (i: number) => (secs[i] ? ps[i]!.y + (heights()[secs[i]!.id] ?? 200) : 0);
    const out: Edge[] = [];
    for (let i = 0; i <= secs.length; i++) {
      const target = secs[i];
      const c = curve(outOf(i - 1), into(i), 0, target ? bendOf(target) : undefined);
      out.push({ key: `f${i}`, ...c, kind: target?.showIf ? 'cond' : 'flow', target, page: i + 1 });
      // A conditional page can be skipped: the flow then goes from the page before it to the page after it, below the
      // nodes in between.
      if (target?.showIf) {
        const a = outOf(i - 1);
        const low = Math.max(bottom(i - 1), bottom(i), bottom(i + 1)) + 36;
        out.push({ key: `b${i}`, ...curve(a, into(i + 1), Math.max(40, (low - a.y) / 0.75)), kind: 'bypass' });
      }
    }
    return out;
  });

  // --- Board: pan with the right or middle button held, or with the wheel. ---
  function pressStage(e: PointerEvent) {
    if (menu() && !(e.target as Element).closest('.fb-bpv-menu')) setMenu(null);
    if (e.button !== 2 && e.button !== 1) return;
    e.preventDefault();
    const from = pan();
    const sx = e.clientX;
    const sy = e.clientY;
    stage.classList.add('is-panning');
    const move = (ev: PointerEvent) => setPan({ x: from.x + ev.clientX - sx, y: from.y + ev.clientY - sy });
    const up = () => { stage.classList.remove('is-panning'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  /** The board never scrolls (overflow: clip). When something on it gets keyboard focus, pan so it is in view. */
  const showFocused = (e: FocusEvent) => {
    const el = e.target as Element;
    if (!el.closest('.fb-bpv-world')) return;
    const r = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const m = 24;
    const dx = r.left < s.left + m ? s.left + m - r.left : r.right > s.right - m ? s.right - m - r.right : 0;
    const dy = r.top < s.top + m ? s.top + m - r.top : r.bottom > s.bottom - m ? s.bottom - m - r.bottom : 0;
    if (dx || dy) setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); setPan((p) => ({ x: p.x - (e.shiftKey ? e.deltaY : e.deltaX), y: p.y - (e.shiftKey ? 0 : e.deltaY) })); };
  /** Center: fit the middle of all pages into view. */
  function center() {
    const ps = positions();
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    const midX = (Math.min(...xs, 0) - 120 + Math.max(...xs, 0) + NODE_W + 160) / 2;
    setPan({ x: Math.round(stage.clientWidth / 2 - midX), y: Math.round(80 - Math.min(...ys, 90) + 40) });
  }

  // --- Moving nodes: drag the header (one undo step on release), or arrow keys. ---
  function pressNode(s: Section, i: number, e: PointerEvent) {
    if (e.button !== 0 || wire() || (e.target as Element).closest('button')) return;
    const from = posOf(s, i);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      setDrag({ id: s.id, x: from.x + dx, y: from.y + dy });
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
    ed.actions.updateSection(s.id, { pos: { x: p.x + a.x * step, y: p.y + a.y * step } });
  }

  // --- Bending a line: drag its middle (the label or "+"). A plain click still opens the condition. ---
  function pressBend(t: Section, e: PointerEvent) {
    if (e.button !== 0 || wire()) return;
    const from = bendOf(t);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      setBendDrag({ id: t.id, x: from.x + dx, y: from.y + dy });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const b = bendDrag();
      if (moved && b) {
        ed.actions.updateSection(t.id, { bend: { x: Math.round(b.x), y: Math.round(b.y) } });
        // The click that follows a bend must not also open the condition.
        window.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
      }
      setBendDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  const straighten = (t: Section) => ed.actions.updateSection(t.id, { bend: undefined });

  // --- Ports and wires ---
  const blockById = (id: string) => locate(ed.doc, id)?.block;
  const sectionIndex = (id: string) => ed.doc.sections.findIndex((s) => s.id === id);
  const openMenu = (m: Menu) => { setWire(null); setMenu(m); };
  function startCondWire(b: Block, c: { label: string; cond: Condition }, at: Pt) {
    setMenu(null);
    const text = ruleText({ match: 'all', conditions: [c.cond] }, ed.doc);
    setWire({ kind: 'cond', from: b.id, cond: c.cond, text, at });
    setCursor(at);
    setNote(`${text}: pull the wire to a later question or page and release (or click) on it. Escape cancels.`);
  }
  function startPageWire(sectionId: string, at: Pt) {
    setMenu(null);
    setWire({ kind: 'page', from: sectionId, at });
    setCursor(at);
    setNote(`Pull the wire to the page that should come after page ${sectionIndex(sectionId) + 1}. Escape cancels.`);
  }
  /** Can the active wire end on this block or section? */
  const canTarget = (id: string, isSection: boolean) => {
    const w = wire();
    if (!w) return false;
    if (w.kind === 'page') return isSection && id !== w.from && sectionIndex(id) !== sectionIndex(w.from) + 1;
    return canUseQuestion(ed.doc, id, w.from);
  };
  function connect(id: string, isSection: boolean) {
    const w = wire();
    if (!w) return;
    if (!canTarget(id, isSection)) {
      setNote(w.kind === 'page' ? 'Pick another page.' : 'Pick a question or page that comes after the question with the wire.');
      return;
    }
    setWire(null);
    if (w.kind === 'page') {
      ed.actions.moveSectionTo(id, sectionIndex(w.from) + 1);
      setNote(`Page ${sectionIndex(id) + 1} now comes right after page ${sectionIndex(w.from) + 1}.`);
      ed.select(id);
      return;
    }
    if (isSection) {
      const s = ed.doc.sections[sectionIndex(id)]!;
      ed.actions.updateSection(id, { showIf: withCondition(s.showIf ? structuredClone(s.showIf) : undefined, w.cond) });
      setNote(`Page ${sectionIndex(id) + 1} now shows only ${w.text.replace(/^If/, 'if')}.`);
    } else {
      const b = blockById(id)!;
      ed.actions.updateBlock(id, { showIf: withCondition(b.showIf ? structuredClone(b.showIf) : undefined, w.cond) });
      setNote(`"${b.label?.trim() || KIND_LABELS[b.kind]}" now shows only ${w.text.replace(/^If/, 'if')}.`);
    }
    ed.select(id);
  }
  /** While wiring: follow the pointer; a release on a target connects; a release on the empty board cancels. */
  const onMove = (e: PointerEvent) => { if (wire()) setCursor(toWorld(e.clientX, e.clientY)); };
  const onUp = (e: PointerEvent) => {
    if (!wire() || e.button !== 0) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const block = el?.closest<HTMLElement>('[data-bpv-block]');
    const section = el?.closest<HTMLElement>('[data-bpv-section]');
    if (el?.closest('.fb-bpv-port, .fb-bpv-menu')) return; // still on the port it started from
    if (block) return connect(block.dataset.bpvBlock!, false);
    if (section) return connect(section.dataset.bpvSection!, true);
    if (el?.closest('.fb-bpv-stage')) { setWire(null); setNote('Wire cancelled.'); }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (wire() || menu())) { e.preventDefault(); setWire(null); setMenu(null); setNote('Cancelled.'); return; }
    // Undo and redo here too (the Edit view's shortcuts are not mounted in this view).
    if (!(e.ctrlKey || e.metaKey) || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'y') { e.preventDefault(); if (k === 'y' || e.shiftKey) ed.history.redo(); else ed.history.undo(); }
  };
  onMount(() => {
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  });

  function addPage(sectionId: string, where: 'before' | 'after') {
    setMenu(null);
    const i = sectionIndex(sectionId);
    const p = positions()[i]!;
    const dx = (NODE_W + GAP_X) * (where === 'after' ? 1 : -1);
    ed.actions.addSectionAt(where === 'after' ? i + 1 : i, { x: p.x + dx, y: p.y });
    setNote(`New page added ${where} page ${where === 'after' ? i + 1 : i + 2}.`);
  }

  /** Where a port menu opens: right of the port, or left when there is no room; always inside the visible board. */
  const MENU_W = 236;
  const menuPos = (m: Menu): Pt => {
    const p = pan();
    const viewL = -p.x + 8;
    const viewR = -p.x + stage.clientWidth - 8;
    const x = m.at.x + 14 + MENU_W <= viewR ? m.at.x + 14 : m.at.x - 14 - MENU_W;
    const y = Math.min(m.at.y - 10, -p.y + stage.clientHeight - 260);
    return { x: Math.max(viewL, x), y: Math.max(-p.y + 8, y) };
  };

  // --- Lines between elements: from a question's dot to each element whose rule uses it. Blocks size themselves, so
  // their ends are measured from the page (in board coordinates, so panning does not change them). ---
  const [chips, setChips] = createSignal<Record<string, { l: Pt; r: Pt }>>({});
  const layoutKey = createMemo(() => JSON.stringify(ed.doc.sections.map((s) => s.rows.map((r) => r.columns.map((c) => c.blocks.map((b) => [b.id, b.label, !!b.showIf]))))));
  function measureChips() {
    const out: Record<string, { l: Pt; r: Pt }> = {};
    for (const el of stage.querySelectorAll<HTMLElement>('[data-bpv-block]')) {
      const r = el.getBoundingClientRect();
      out[el.dataset.bpvBlock!] = { l: toWorld(r.left, r.top + r.height / 2), r: toWorld(r.right, r.top + r.height / 2) };
    }
    setChips(out);
  }
  createEffect(() => { positions(); heights(); layoutKey(); queueMicrotask(measureChips); });
  const SHORT: Record<string, (v: string) => string> = {
    equals: (v) => `"${v}"`, not_equals: (v) => `not "${v}"`, contains: (v) => `has "${v}"`, gt: (v) => `> ${v}`, lt: (v) => `< ${v}`,
    answered: () => 'answered', not_answered: () => 'not answered',
  };
  const elementEdges = createMemo(() => {
    const c = chips();
    const out: { key: string; d: string; mid: Pt; source: string; target: string; text: string; title: string }[] = [];
    for (const s of ed.doc.sections) for (const r of s.rows) for (const col of r.columns) for (const b of col.blocks) {
      if (!b.showIf) continue;
      for (const [i, cond] of b.showIf.conditions.entries()) {
        const a = c[cond.q];
        const t = c[b.id];
        if (!a || !t) continue;
        const k = curve({ x: a.r.x - 13, y: a.r.y }, { x: t.l.x - 2, y: t.l.y });
        out.push({ key: `${b.id}:${i}`, ...k, source: cond.q, target: b.id, text: SHORT[cond.op]!(String(cond.value ?? '')), title: ruleText({ match: 'all', conditions: [cond] }, ed.doc) });
      }
    }
    return out;
  });

  const label = (b: Block) => b.label?.trim() || KIND_LABELS[b.kind];
  const sel = () => ed.selected();
  const wirePath = () => { const w = wire(); return w ? curve(w.at, cursor()).d : ''; };

  return (
    <div class="fb-bpv">
      <div ref={stage} class="fb-bpv-stage" classList={{ 'is-wiring': !!wire() }} style={{ 'background-position': `${pan().x}px ${pan().y}px` }} onPointerDown={pressStage} onWheel={wheel} onFocusIn={showFocused}
        onContextMenu={(e) => e.preventDefault()} onClick={(e) => (e.target === e.currentTarget || (e.target as Element).classList.contains('fb-bpv-world')) && !wire() && ed.select(null)}>
        <div class="fb-bpv-world" style={{ transform: `translate(${pan().x}px, ${pan().y}px)` }}>
          <svg class="fb-bpv-lines" width="1" height="1" aria-hidden="true">
            <defs>
              <For each={['flow', 'cond', 'bypass']}>
                {(k) => <marker id={`fb-bpv-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class={`fb-bpv-arrow is-${k}`} /></marker>}
              </For>
            </defs>
            <For each={edges()}>{(e) => <path d={e.d} class={`fb-bpv-edge is-${e.kind}`} marker-end={`url(#fb-bpv-arrow-${e.kind})`} />}</For>
            <Show when={wire()}><path d={wirePath()} class="fb-bpv-edge is-wire" /></Show>
          </svg>

          {/* Line handles: a condition to edit, or a "+" to add one. Both drag to bend the line. */}
          <For each={edges()}>
            {(e) => (
              <Show when={e.kind === 'bypass'} fallback={
                <Show when={e.target} keyed>
                  {(t) => (
                    <Show when={t.showIf} keyed fallback={
                      <Show when={e.page! > 1}>
                        <button type="button" class="fb-bpv-add" style={{ left: `${e.mid.x}px`, top: `${e.mid.y}px` }}
                          aria-label={`Add a condition to page ${e.page}. Drag to bend the line.`} title="Click: show this page only if… · Drag: bend the line · Double-click: straighten"
                          onPointerDown={(ev) => pressBend(t, ev)} onDblClick={() => straighten(t)} onClick={() => ed.select(t.id)}>
                          <Icon name="plus" size="sm" />
                        </button>
                      </Show>
                    }>
                      {(rule) => (
                        <button type="button" class="fb-bpv-cond" classList={{ 'is-on': sel() === t.id }} style={{ left: `${e.mid.x}px`, top: `${e.mid.y}px` }}
                          title={`${ruleText(rule, ed.doc)}. Click to change · Drag to bend the line · Double-click to straighten`}
                          onPointerDown={(ev) => pressBend(t, ev)} onDblClick={() => straighten(t)} onClick={() => ed.select(t.id)}>
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
              <section ref={measure} data-bpv-section={s.id} class="fb-bpv-node"
                classList={{ 'is-selected': sel() === s.id, 'is-dragging': drag()?.id === s.id, 'is-cond': !!s.showIf, 'is-target': canTarget(s.id, true) }}
                style={{ left: `${posOf(s, i()).x}px`, top: `${posOf(s, i()).y}px`, width: `${NODE_W}px` }} aria-label={`Page ${i() + 1}`}>
                <button type="button" class="fb-bpv-port is-in" aria-label={`Page ${i() + 1}: add a page before it`} title="Add a page before"
                  onClick={(ev) => { ev.stopPropagation(); openMenu({ kind: 'in', sectionId: s.id, at: centerOf(ev.currentTarget) }); }} />
                <button type="button" class="fb-bpv-port is-out" aria-label={`Page ${i() + 1}: add a page after it, or connect it to another page`} title="Add a page after, or connect to a page"
                  onClick={(ev) => { ev.stopPropagation(); openMenu({ kind: 'out', sectionId: s.id, at: centerOf(ev.currentTarget) }); }} />
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
                                    <div class="fb-bpv-elw">
                                      <button type="button" data-bpv-block={b.id} class="fb-bpv-el"
                                        classList={{ 'is-q': isQuestion(b), 'is-cond': !!b.showIf, 'is-selected': sel() === b.id, 'is-target': canTarget(b.id, false), 'is-source': wire()?.from === b.id }}
                                        title={b.showIf ? `${label(b)} — ${ruleText(b.showIf, ed.doc)}` : label(b)} onClick={() => !wire() && ed.select(b.id)}>
                                        <Icon name={KIND_ICON[b.kind]} size="sm" /><span>{label(b)}</span>
                                        <Show when={b.showIf}><span class="fb-bpv-if" aria-label="Has a condition"><Icon name="branch" size="sm" /></span></Show>
                                      </button>
                                      <Show when={isQuestion(b)}>
                                        <button type="button" class="fb-bpv-port is-q" aria-label={`Add a condition from "${label(b)}"`} title="Show something only for an answer to this question"
                                          onClick={(ev) => { ev.stopPropagation(); openMenu({ kind: 'q', blockId: b.id, at: centerOf(ev.currentTarget) }); }} />
                                      </Show>
                                    </div>
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

          {/* Element condition lines sit above the pages, so they can run between blocks. */}
          <svg class="fb-bpv-lines is-top" width="1" height="1" aria-hidden="true">
            <defs>
              <marker id="fb-bpv-arrow-elem" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="fb-bpv-arrow is-elem" /></marker>
            </defs>
            <For each={elementEdges()}>
              {(e) => <path d={e.d} class="fb-bpv-edge is-elem" classList={{ 'is-on': sel() === e.target || sel() === e.source }} marker-end="url(#fb-bpv-arrow-elem)" />}
            </For>
          </svg>
          <For each={elementEdges()}>
            {(e) => (
              <button type="button" class="fb-bpv-elabel" classList={{ 'is-on': sel() === e.target || sel() === e.source }}
                style={{ left: `${e.mid.x}px`, top: `${e.mid.y}px` }} title={`${e.title}. Click to change.`} onClick={() => ed.select(e.target)}>
                {e.text}
              </button>
            )}
          </For>

          {/* Port menus */}
          <Show when={menu()} keyed>
            {(m) => (
              <div class="fb-menu fb-bpv-menu" role="menu" style={{ left: `${menuPos(m).x}px`, top: `${menuPos(m).y}px` }}>
                <Show when={m.kind === 'q' ? blockById((m as { blockId: string }).blockId) : undefined} keyed
                  fallback={
                    <Show when={m.kind === 'out'} fallback={
                      <button type="button" role="menuitem" onClick={() => addPage((m as { sectionId: string }).sectionId, 'before')}><Icon name="plus" size="sm" />Add a page before</button>
                    }>
                      <button type="button" role="menuitem" onClick={() => addPage((m as { sectionId: string }).sectionId, 'after')}><Icon name="plus" size="sm" />Add a page after</button>
                      <button type="button" role="menuitem" onClick={() => startPageWire((m as { sectionId: string }).sectionId, m.at)}><Icon name="branch" size="sm" />Connect to a page…</button>
                    </Show>
                  }>
                  {(b) => (
                    <>
                      <span class="fb-cap fb-bpv-menu-t">Show the next thing only if "{label(b)}"…</span>
                      <For each={choicesFor(b)}>
                        {(c) => <button type="button" role="menuitem" onClick={() => startCondWire(b, c, m.at)}>{c.label}</button>}
                      </For>
                    </>
                  )}
                </Show>
              </div>
            )}
          </Show>
          <Show when={wire()?.kind === 'cond' ? (wire() as { text: string }).text : ''}>
            {(t) => <span class="fb-bpv-wiretag" style={{ left: `${cursor().x + 14}px`, top: `${cursor().y + 14}px` }}>{t()}</span>}
          </Show>
        </div>

        <div class="fb-bpv-tools">
          <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" onClick={center} title="Bring all pages into view"><Icon name="monitor" size="sm" />Center</button>
          <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" disabled={!ed.doc.sections.some((s) => s.pos || s.bend)}
            onClick={() => ed.actions.clearPositions()} title="Put every page back in a row, in page order, with straight lines">
            <Icon name="columns" size="sm" />Auto layout
          </button>
          <span class="fb-bpv-legend" aria-hidden="true"><i class="is-flow" />Next page<i class="is-cond" />Only if<i class="is-bypass" />Otherwise</span>
        </div>
        <p class="fb-bpv-note" role="status">{note() || 'Right-drag or scroll to move around. Click a dot to add a condition or a page.'}</p>
      </div>
      <BlueprintPanel />
    </div>
  );
}

/** The side panel: when the selected page or question shows. Reads the live form, so changes show at once. */
function BlueprintPanel() {
  const ed = useEditor();
  const target = createMemo(() => { const id = ed.selected(); return id ? locate(ed.doc, id) : null; });
  return (
    <aside class="fb-insp fb-bpv-panel" aria-label="Condition">
      <Show when={target()} fallback={
        <div class="fb-insp-s">
          <div class="fb-insp-t">Blueprint</div>
          <p class="fb-help">Each node is a page. Lines show the order visitors go through. A dashed line means the page shows only
            if its condition is true; the "Otherwise" line shows where visitors go when it is not.</p>
          <p class="fb-help">Click the dot beside a question, pick an answer and pull the wire to a later question or page. The dots on
            a page's sides add a page or connect pages. Save draft keeps the layout.</p>
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
