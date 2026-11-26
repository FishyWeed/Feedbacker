// Blueprint view: the form as a circuit on a free board. Every section (page) is a node; flow lines join the pages in
// order, from Start to the thank-you page. A page or question with a condition gets a dashed line labeled with its
// rule, and an "Otherwise" line shows the skip.
//
// - Board: no scrollbars. Hold the right (or middle) mouse button to pan, or use the wheel. Ctrl+wheel, a pinch,
//   Ctrl +/-/0 or the toolbar zoom. "Center" brings the pages back.
// - Nodes: drag by the header, or arrow keys; resize from the corner. Lines (page lines and condition lines between
//   elements): drag the middle (label or "+") to bend; double-click to straighten.
// - The side panel can be hidden and docked left, right or bottom (remembered in this browser).
// - Question ports: click the dot beside a question, pick an answer, then pull the wire to a later question or page:
//   that target shows only for that answer. Page ports: add a page before or after, or wire to another page to make
//   it come next.
// Positions and bends are part of the draft, so Save draft keeps them; every change is one undo step.
import { createEffect, createMemo, createSignal, For, Show, onCleanup, onMount } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { canUseQuestion, ruleText, withCondition } from '../../shared/logic';
import { isQuestion, KIND_LABELS, optionsOf, type Block, type Condition, type Section } from '../../shared/schema';
import { Icon, KIND_ICON } from '../ui/icons';
import { Seg } from '../ui/kit';
import { locate, useEditor } from './editorStore';
import { RuleEditor } from './Inspector';

const NODE_W = 280;
const GAP_X = 200; // room for a condition label above the line
const PORT_Y = 26; // flow lines meet a node at the middle of its header
const MOVE_PX = 20; // arrow-key step (Shift: 3 steps)
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const MIN_W = 200;

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
  const [zoom, setZoom] = createSignal(1);
  const [sizeDrag, setSizeDrag] = createSignal<{ id: string; w: number; h: number } | null>(null);
  const [elemBend, setElemBend] = createSignal<{ key: string; x: number; y: number } | null>(null);
  const [gapDrag, setGapDrag] = createSignal<{ id: string; x: number; y: number } | null>(null);
  const [drag, setDrag] = createSignal<{ id: string; x: number; y: number } | null>(null);
  const [bendDrag, setBendDrag] = createSignal<{ id: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = createSignal<Menu | null>(null);
  const [wire, setWire] = createSignal<Wire | null>(null);
  const [cursor, setCursor] = createSignal<Pt>({ x: 0, y: 0 });
  const [note, setNote] = createSignal('');
  let stage!: HTMLDivElement;
  /** Screen point → board point (undoes the pan and the zoom). */
  const toWorld = (cx: number, cy: number): Pt => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - pan().x) / zoom(), y: (cy - r.top - pan().y) / zoom() }; };
  /** Board point → point on the stage (for things drawn at screen size: menus, the wire tag). */
  const toStage = (p: Pt): Pt => ({ x: p.x * zoom() + pan().x, y: p.y * zoom() + pan().y });

  /** Follows a drag: `onMove` gets the movement in board units once it passes 3px; `onEnd(moved)` on release. */
  function dragBy(e: PointerEvent, onMove: (dx: number, dy: number) => void, onEnd: (moved: boolean) => void) {
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      onMove(dx / zoom(), dy / zoom());
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onEnd(moved); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  /** The click that follows a drag must not also select or open something. The browser sends that click (if any) right
   * after the release, so the guard ends with this task; otherwise it would swallow a later, unrelated click. */
  function eatNextClick() {
    const eat = (ev: Event) => ev.stopPropagation();
    window.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0);
  }
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

  const widthOf = (s: Section) => { const d = sizeDrag(); return d?.id === s.id ? d.w : s.size?.w ?? NODE_W; };
  const DEFAULT_GAP = 10;
  const spacingOf = (s: Section) => { const d = gapDrag(); return d?.id === s.id ? d : s.spacing ?? { x: DEFAULT_GAP, y: DEFAULT_GAP }; };
  const minHeightOf = (s: Section) => { const d = sizeDrag(); return d?.id === s.id ? d.h : s.size?.h ?? 0; };
  const autoXs = createMemo(() => { let x = 160; return ed.doc.sections.map((s) => { const at = x; x += widthOf(s) + GAP_X; return at; }); });
  const auto = (i: number): Pt => ({ x: autoXs()[i] ?? 160, y: 90 });
  const posOf = (s: Section, i: number): Pt => { const d = drag(); return d?.id === s.id ? d : s.pos ?? auto(i); };
  const bendOf = (s: Section): Pt => { const b = bendDrag(); return b?.id === s.id ? b : s.bend ?? { x: 0, y: 0 }; };
  const positions = createMemo(() => ed.doc.sections.map(posOf));
  const last = () => positions()[positions().length - 1] ?? { x: 160, y: 90 };
  const start = (): Pt => { const p = positions()[0] ?? auto(0); return { x: p.x - 120, y: p.y + PORT_Y }; };
  const lastWidth = () => { const secs = ed.doc.sections; return secs.length ? widthOf(secs[secs.length - 1]!) : NODE_W; };
  const end = (): Pt => ({ x: last().x + lastWidth() + GAP_X / 2 + 20, y: last().y + PORT_Y });

  const edges = createMemo<Edge[]>(() => {
    const secs = ed.doc.sections;
    const ps = positions();
    // Lines leave from the outer edge of a page's right dot and arrive at the outer edge of the next page's left dot.
    const outOf = (i: number): Pt => (i < 0 ? { x: start().x + 64, y: start().y } : { x: ps[i]!.x + widthOf(secs[i]!) + 8, y: ps[i]!.y + PORT_Y });
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
  /** Zoom to `z`, keeping the board point under (sx, sy) (stage pixels) where it is. */
  function zoomAt(z: number, sx = stage.clientWidth / 2, sy = stage.clientHeight / 2) {
    const z0 = zoom();
    const z1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
    if (z1 === z0) return;
    setPan((p) => ({ x: sx - ((sx - p.x) * z1) / z0, y: sy - ((sy - p.y) * z1) / z0 }));
    setZoom(z1);
  }
  // Wheel pans; Ctrl/Cmd+wheel (and a trackpad pinch, which the browser sends as Ctrl+wheel) zooms at the pointer.
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const r = stage.getBoundingClientRect();
      return zoomAt(zoom() * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }
    setPan((p) => ({ x: p.x - (e.shiftKey ? e.deltaY : e.deltaX), y: p.y - (e.shiftKey ? 0 : e.deltaY) }));
  };
  /** Center: fit the middle of all pages into view. */
  function center() {
    const ps = positions();
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    const midX = (Math.min(...xs, 0) - 120 + Math.max(...xs, 0) + lastWidth() + 160) / 2;
    setPan({ x: Math.round(stage.clientWidth / 2 - midX * zoom()), y: Math.round(80 - Math.min(...ys, 90) * zoom() + 40) });
  }

  // --- Moving nodes: drag the header (one undo step on release), or arrow keys. ---
  function pressNode(s: Section, i: number, e: PointerEvent) {
    if (e.button !== 0 || wire() || (e.target as Element).closest('button')) return;
    const from = posOf(s, i);
    dragBy(e, (dx, dy) => setDrag({ id: s.id, x: from.x + dx, y: from.y + dy }), (moved) => {
      const d = drag();
      if (moved && d) ed.actions.updateSection(s.id, { pos: { x: Math.round(d.x), y: Math.round(d.y) } });
      setDrag(null);
      if (!moved) ed.select(s.id);
    });
  }

  // --- Resizing a page: drag its corner (width and minimum height), arrow keys on the corner, double-click resets. ---
  function pressResize(s: Section, e: PointerEvent) {
    if (e.button !== 0 || wire()) return;
    e.stopPropagation();
    const w0 = widthOf(s);
    const h0 = heights()[s.id] ?? 200;
    dragBy(e, (dx, dy) => setSizeDrag({ id: s.id, w: Math.max(MIN_W, w0 + dx), h: Math.max(0, h0 + dy) }), (moved) => {
      const d = sizeDrag();
      if (moved && d) { ed.actions.updateSection(s.id, { size: { w: Math.round(d.w), h: Math.round(d.h) } }); eatNextClick(); }
      setSizeDrag(null);
    });
  }
  // --- Spacing inside a page, per axis: a bar between rows changes only the vertical space (rows and stacked blocks),
  // a bar between columns only the horizontal space. Drag, arrow keys, or double-click to reset that axis. ---
  const clampGap = (n: number) => Math.round(Math.max(0, Math.min(200, n)));
  const setSpacing = (s: Section, axis: 'x' | 'y', v: number | null) => {
    const now = spacingOf(s);
    ed.actions.updateSection(s.id, { spacing: { x: now.x, y: now.y, [axis]: v === null ? DEFAULT_GAP : clampGap(v) } });
  };
  function pressGap(s: Section, axis: 'x' | 'y', e: PointerEvent) {
    if (e.button !== 0 || wire()) return;
    e.stopPropagation();
    const v0 = { x: spacingOf(s).x, y: spacingOf(s).y };
    // The bar sits in the middle of its gap, so the gap grows twice as fast as the bar moves.
    dragBy(e, (dx, dy) => setGapDrag({ id: s.id, ...v0, [axis]: clampGap(v0[axis] + 2 * (axis === 'x' ? dx : dy)) }), (moved) => {
      const d = gapDrag();
      if (moved && d) { setSpacing(s, axis, d[axis]); eatNextClick(); }
      setGapDrag(null);
    });
  }
  function keyGap(s: Section, axis: 'x' | 'y', e: KeyboardEvent) {
    const a = ARROWS[e.key];
    if (!a) return;
    e.preventDefault();
    const step = (e.shiftKey ? 12 : 4) * (axis === 'x' ? a.x || -a.y : a.y || a.x);
    setSpacing(s, axis, spacingOf(s)[axis] + step);
  }
  const gapLabel = (s: Section, axis: 'x' | 'y') =>
    `${axis === 'y' ? 'Space between rows' : 'Space between columns'}: ${spacingOf(s)[axis]} pixels. Drag or use the arrow keys; double-click resets.`;

  function keyResize(s: Section, e: KeyboardEvent) {
    const a = ARROWS[e.key];
    if (!a) return;
    e.preventDefault();
    const step = e.shiftKey ? MOVE_PX * 3 : MOVE_PX;
    const w = Math.max(MIN_W, widthOf(s) + a.x * step);
    const h = Math.max(0, (s.size?.h ?? heights()[s.id] ?? 200) + a.y * step);
    ed.actions.updateSection(s.id, { size: { w, h } });
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
    dragBy(e, (dx, dy) => setBendDrag({ id: t.id, x: from.x + dx, y: from.y + dy }), (moved) => {
      const b = bendDrag();
      if (moved && b) { ed.actions.updateSection(t.id, { bend: { x: Math.round(b.x), y: Math.round(b.y) } }); eatNextClick(); }
      setBendDrag(null);
    });
  }
  const straighten = (t: Section) => ed.actions.updateSection(t.id, { bend: undefined });

  // --- Moving a condition between elements: drag its label; the line bends with it. Saved on the block, per question. ---
  const elemBendOf = (target: Block, q: string): Pt => { const d = elemBend(); return d?.key === `${target.id}|${q}` ? d : target.bends?.[q] ?? { x: 0, y: 0 }; };
  function pressElemBend(targetId: string, q: string, e: PointerEvent) {
    if (e.button !== 0 || wire()) return;
    const b = blockById(targetId);
    if (!b) return;
    const from = elemBendOf(b, q);
    dragBy(e, (dx, dy) => setElemBend({ key: `${targetId}|${q}`, x: from.x + dx, y: from.y + dy }), (moved) => {
      const d = elemBend();
      if (moved && d) {
        const bends = { ...structuredClone(unwrap(b.bends) ?? {}), [q]: { x: Math.round(d.x), y: Math.round(d.y) } };
        ed.actions.updateBlock(targetId, { bends });
        eatNextClick();
      }
      setElemBend(null);
    });
  }
  function straightenElem(targetId: string, q: string) {
    const b = blockById(targetId);
    if (!b?.bends?.[q]) return;
    const bends = structuredClone(unwrap(b.bends));
    delete bends[q];
    ed.actions.updateBlock(targetId, { bends: Object.keys(bends).length ? bends : undefined });
  }

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
    // Ctrl +/-/0 zoom the board, not the whole page.
    if (k === '=' || k === '+') { e.preventDefault(); zoomAt(zoom() * 1.2); }
    if (k === '-' || k === '_') { e.preventDefault(); zoomAt(zoom() / 1.2); }
    if (k === '0') { e.preventDefault(); zoomAt(1); }
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
    const dx = where === 'after' ? widthOf(ed.doc.sections[i]!) + GAP_X : -(NODE_W + GAP_X);
    ed.actions.addSectionAt(where === 'after' ? i + 1 : i, { x: p.x + dx, y: p.y });
    setNote(`New page added ${where} page ${where === 'after' ? i + 1 : i + 2}.`);
  }

  /** Where a port menu opens: right of the port, or left when there is no room; always inside the visible board. */
  const MENU_W = 236;
  const menuPos = (m: Menu): Pt => {
    const a = toStage(m.at);
    const x = a.x + 14 + MENU_W <= stage.clientWidth - 8 ? a.x + 14 : a.x - 14 - MENU_W;
    return { x: Math.max(8, x), y: Math.max(8, Math.min(a.y - 10, stage.clientHeight - 260)) };
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
  createEffect(() => { positions(); heights(); layoutKey(); ed.doc.sections.map(widthOf); ed.doc.sections.map((x) => { const g = spacingOf(x); return g.x + g.y; }); queueMicrotask(measureChips); });
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
        const k = curve({ x: a.r.x - 13, y: a.r.y }, { x: t.l.x - 2, y: t.l.y }, 0, elemBendOf(b, cond.q));
        out.push({ key: `${b.id}:${i}`, ...k, source: cond.q, target: b.id, text: SHORT[cond.op]!(String(cond.value ?? '')), title: ruleText({ match: 'all', conditions: [cond] }, ed.doc) });
      }
    }
    return out;
  });

  // Side panel: dock (left, right, bottom) and shown or hidden, kept per browser.
  type Dock = 'left' | 'right' | 'bottom';
  const readPanel = (): { dock: Dock; open: boolean } => {
    try { const v = JSON.parse(localStorage.getItem('fb-bpv-panel') ?? 'null'); if (v && ['left', 'right', 'bottom'].includes(v.dock)) return { dock: v.dock, open: v.open !== false }; } catch { /* default */ }
    return { dock: 'right', open: true };
  };
  const [panel, setPanelState] = createSignal(readPanel());
  const setPanel = (v: { dock: Dock; open: boolean }) => { setPanelState(v); try { localStorage.setItem('fb-bpv-panel', JSON.stringify(v)); } catch { /* private mode */ } };

  const label = (b: Block) => b.label?.trim() || KIND_LABELS[b.kind];
  const sel = () => ed.selected();
  const wirePath = () => { const w = wire(); return w ? curve(w.at, cursor()).d : ''; };

  return (
    <div class="fb-bpv" data-dock={panel().dock} classList={{ 'no-panel': !panel().open }}>
      <div ref={stage} class="fb-bpv-stage" classList={{ 'is-wiring': !!wire() }} style={{ 'background-position': `${pan().x}px ${pan().y}px`, 'background-size': `${20 * zoom()}px ${20 * zoom()}px` }} onPointerDown={pressStage} onWheel={wheel} onFocusIn={showFocused}
        onContextMenu={(e) => e.preventDefault()} onClick={(e) => (e.target === e.currentTarget || (e.target as Element).classList.contains('fb-bpv-world')) && !wire() && ed.select(null)}>
        <div class="fb-bpv-world" style={{ transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})` }}>
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
                style={{ left: `${posOf(s, i()).x}px`, top: `${posOf(s, i()).y}px`, width: `${widthOf(s)}px`, 'min-height': `${minHeightOf(s)}px` }} aria-label={`Page ${i() + 1}`}>
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
                <div class="fb-bpv-flow" style={{ '--gap-x': `${spacingOf(s).x}px`, '--gap-y': `${spacingOf(s).y}px` }}>
                  <Show when={s.rows.some((r) => r.columns.some((c) => c.blocks.length))} fallback={<p class="fb-bpv-empty">No blocks yet</p>}>
                    <For each={s.rows}>
                      {(r, ri) => (
                        <div class="fb-bpv-row" style={{ '--n': r.columns.length }}>
                          <Show when={ri() < s.rows.length - 1}>
                            <span class="fb-bpv-gap is-row" role="separator" aria-orientation="horizontal" tabIndex={0} aria-label={gapLabel(s, 'y')} title="Drag up or down: space between rows · Double-click resets"
                              onPointerDown={(e) => pressGap(s, 'y', e)} onKeyDown={(e) => keyGap(s, 'y', e)} onDblClick={() => setSpacing(s, 'y', null)} />
                          </Show>
                          <For each={r.columns}>
                            {(c, ci) => (
                              <div class="fb-bpv-col">
                                <Show when={ci() < r.columns.length - 1}>
                                  <span class="fb-bpv-gap is-col" role="separator" aria-orientation="vertical" tabIndex={0} aria-label={gapLabel(s, 'x')} title="Drag left or right: space between columns · Double-click resets"
                                    onPointerDown={(e) => pressGap(s, 'x', e)} onKeyDown={(e) => keyGap(s, 'x', e)} onDblClick={() => setSpacing(s, 'x', null)} />
                                </Show>
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
                <button type="button" class="fb-bpv-resize" aria-label={`Resize page ${i() + 1}. Arrow keys change its size; double-click resets it.`}
                  title="Drag to resize · Double-click to reset" onPointerDown={(e) => pressResize(s, e)} onKeyDown={(e) => keyResize(s, e)}
                  onDblClick={() => ed.actions.updateSection(s.id, { size: undefined })} />
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
                style={{ left: `${e.mid.x}px`, top: `${e.mid.y}px` }} title={`${e.title}. Click to change · Drag to move · Double-click to straighten`}
                onPointerDown={(ev) => pressElemBend(e.target, e.source, ev)} onDblClick={() => straightenElem(e.target, e.source)} onClick={() => ed.select(e.target)}>
                {e.text}
              </button>
            )}
          </For>

        </div>

        {/* Port menus, drawn at screen size above the board */}
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
          {(t) => <span class="fb-bpv-wiretag" style={{ left: `${toStage(cursor()).x + 14}px`, top: `${toStage(cursor()).y + 14}px` }}>{t()}</span>}
        </Show>
        <div class="fb-bpv-tools">
          <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" onClick={center} title="Bring all pages into view"><Icon name="monitor" size="sm" />Center</button>
          <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" disabled={!ed.doc.sections.some((s) => s.pos || s.bend || s.rows.some((r) => r.columns.some((c) => c.blocks.some((b) => b.bends))))}
            onClick={() => ed.actions.clearPositions()} title="Put every page back in a row, in page order, with straight lines">
            <Icon name="columns" size="sm" />Auto layout
          </button>
          <span class="fb-bpv-zoom" role="group" aria-label="Zoom">
            <button type="button" class="fb-btn fb-btn--ghost fb-btn--sm fb-btn--icon" aria-label="Zoom out" title="Zoom out (Ctrl −)" disabled={zoom() <= ZOOM_MIN} onClick={() => zoomAt(zoom() / 1.2)}><Icon name="minus" size="sm" /></button>
            <button type="button" class="fb-btn fb-btn--ghost fb-btn--sm fb-bpv-zoom-n" title="Reset to 100% (Ctrl 0)" onClick={() => zoomAt(1)}>{Math.round(zoom() * 100)}%</button>
            <button type="button" class="fb-btn fb-btn--ghost fb-btn--sm fb-btn--icon" aria-label="Zoom in" title="Zoom in (Ctrl +)" disabled={zoom() >= ZOOM_MAX} onClick={() => zoomAt(zoom() * 1.2)}><Icon name="plus" size="sm" /></button>
          </span>
          <Show when={!panel().open}>
            <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" onClick={() => setPanel({ ...panel(), open: true })}><Icon name="columns" size="sm" />Show panel</button>
          </Show>
          <span class="fb-bpv-legend" aria-hidden="true"><i class="is-flow" />Next page<i class="is-cond" />Only if<i class="is-bypass" />Otherwise</span>
        </div>
        <p class="fb-bpv-note" role="status">{note() || 'Right-drag or scroll to move around. Click a dot to add a condition or a page.'}</p>
      </div>
      <Show when={panel().open}>
        <BlueprintPanel dock={panel().dock} onDock={(dock) => setPanel({ dock, open: true })} onHide={() => setPanel({ ...panel(), open: false })} />
      </Show>
    </div>
  );
}

/** The side panel: when the selected page or question shows. Reads the live form, so changes show at once. */
function BlueprintPanel(props: { dock: 'left' | 'right' | 'bottom'; onDock: (d: 'left' | 'right' | 'bottom') => void; onHide: () => void }) {
  const ed = useEditor();
  const target = createMemo(() => { const id = ed.selected(); return id ? locate(ed.doc, id) : null; });
  return (
    <aside class="fb-insp fb-bpv-panel" aria-label="Condition">
      <div class="fb-bpv-panel-bar">
        <Seg small label="Panel position" value={props.dock} onChange={props.onDock}
          options={[{ value: 'left', label: 'Left' }, { value: 'bottom', label: 'Bottom' }, { value: 'right', label: 'Right' }]} />
        <button type="button" class="fb-btn fb-btn--ghost fb-btn--sm fb-btn--icon" aria-label="Hide panel" title="Hide panel" onClick={props.onHide}><Icon name="x" size="sm" /></button>
      </div>
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
