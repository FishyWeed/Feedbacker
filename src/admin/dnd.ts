// Drag-and-drop pointer engine (design system: DragAndDrop.md §2–§4). Mouse, pen and touch; no library.
// It owns the pointer: press, the 4px / 250ms start, hysteresis, auto-scroll, Esc and cancel. The editor owns what a
// drop means (onDrop / onCancel) and draws every state from drag() and pointer().
import { batch, createSignal } from 'solid-js';
import { MAX_COLUMNS, type BlockKind } from '../../shared/schema';
import { fade, flyBack } from './motion';
import { targetKey, type Target } from './moves';

export type Source = { type: 'new'; kind: BlockKind } | { type: 'block' | 'row' | 'section'; id: string };
export const sourceKey = (s: Source) => (s.type === 'new' ? `new:${s.kind}` : `${s.type}:${s.id}`);

export type Drag = {
  source: Source;
  phase: 'drag' | 'flyback';
  target: Target | null;
  /** Pointer offset inside the picked-up element, and its size (overlay width, slot height). */
  dx: number; dy: number; w: number; h: number;
};

type Opts = {
  canvas: () => HTMLElement | undefined;
  overlay: () => HTMLElement | undefined;
  onLift: (d: Drag) => void;
  /** Called while the slot and overlay are still on screen (take the FLIP snapshot here). */
  onBeforeEnd: (d: Drag) => void;
  onDrop: (d: Drag, target: Target) => void;
  onCancel: (d: Drag) => void;
};

const START_PX = 4; // mouse and pen: a drag starts after 4px of movement
const HOLD_MS = 250; // touch: a long-press starts it
const SCROLL_PX = 8; // touch: moving more than this before the long-press is a scroll
const HYSTERESIS_MS = 60;
const EDGE_PX = 56; // auto-scroll band at the canvas top and bottom
const GAP_PX = 14; // within this of a row gap → new row

export function createDnd(opts: Opts) {
  const [drag, setDrag] = createSignal<Drag | null>(null);
  const [pointer, setPointer] = createSignal({ x: 0, y: 0 });
  const [pressed, setPressed] = createSignal<string | null>(null);
  const [scrolling, setScrolling] = createSignal<'up' | 'down' | null>(null);
  let pending: { target: Target | null; key: string } | null = null;
  let hysteresis = 0;
  let raf = 0;
  let detach: (() => void) | null = null;

  const update = (x: number, y: number) => {
    const d = drag();
    const canvas = opts.canvas();
    if (!d || d.phase !== 'drag' || !canvas) return;
    setPointer({ x, y });
    const raw = hitTest(canvas, d.source, x, y, d.target);
    const key = targetKey(raw);
    if (key === targetKey(d.target)) { pending = null; clearTimeout(hysteresis); return; }
    if (pending?.key === key) return;
    // Adopt a new target only after the pointer has pointed at it for 60ms, so the indicator never flickers.
    pending = { target: raw, key };
    clearTimeout(hysteresis);
    hysteresis = window.setTimeout(() => {
      const now = drag();
      if (now && pending) setDrag({ ...now, target: pending.target });
      pending = null;
    }, HYSTERESIS_MS);
  };

  const autoScroll = () => {
    const d = drag();
    const canvas = opts.canvas();
    if (!d || d.phase !== 'drag' || !canvas) return setScrolling(null);
    const r = canvas.getBoundingClientRect();
    const { x, y } = pointer();
    let v = 0;
    if (x >= r.left && x <= r.right) {
      const speed = (into: number) => 2 + 16 * Math.min(1, into / EDGE_PX); // 2 to 18 px per frame
      if (y < r.top + EDGE_PX) v = -speed(r.top + EDGE_PX - y);
      else if (y > r.bottom - EDGE_PX) v = speed(y - (r.bottom - EDGE_PX));
    }
    const before = canvas.scrollTop;
    if (v) canvas.scrollTop += v;
    const moved = canvas.scrollTop !== before;
    setScrolling(moved ? (v < 0 ? 'up' : 'down') : null);
    if (moved) update(x, y); // the content moved under a still pointer
    raf = requestAnimationFrame(autoScroll);
  };

  function stop() {
    detach?.();
    detach = null;
    cancelAnimationFrame(raf);
    clearTimeout(hysteresis);
    pending = null;
    setScrolling(null);
    setPressed(null);
    document.body.classList.remove('fb-grabbing', 'fb-nodrop-cursor');
  }

  /** Removes every drag state at once (the editor calls it inside the batch that changes the form). */
  function clear() {
    stop();
    setDrag(null);
  }

  /** Cancel: a block flies back to its original; a palette item, row or page fades. Then the drag is gone. */
  async function goHome() {
    const d = drag();
    if (!d) return;
    stop();
    setDrag({ ...d, phase: 'flyback', target: null });
    const overlay = opts.overlay();
    const home = d.source.type === 'block' ? opts.canvas()?.querySelector(`[data-fb-block="${d.source.id}"]`)?.getBoundingClientRect() ?? null : null;
    if (overlay) await (d.source.type === 'block' ? flyBack(overlay, home) : fade(overlay));
    setDrag(null);
  }

  function cancel() {
    const d = drag();
    if (!d || d.phase !== 'drag') return;
    opts.onCancel(d);
  }

  function end(x: number, y: number) {
    const d = drag();
    const canvas = opts.canvas();
    if (!d || d.phase !== 'drag' || !canvas) return;
    // At release, test the exact spot without hysteresis, so a quick flick lands where the pointer is.
    const final = hitTest(canvas, d.source, x, y, d.target);
    const done = { ...d, target: final };
    batch(() => setDrag(done));
    if (!final || final.type === 'invalid') return opts.onCancel(done);
    opts.onBeforeEnd(done);
    opts.onDrop(done, final);
  }

  /** Pointer down on a palette item, block or handle. `el` is what gets picked up (its size and the pointer offset). */
  function press(source: Source, e: PointerEvent, el: HTMLElement) {
    if (e.button !== 0 || drag() || detach) return;
    const start = { x: e.clientX, y: e.clientY };
    const touch = e.pointerType === 'touch';
    const rect = el.getBoundingClientRect();
    setPressed(sourceKey(source));
    let holdTimer = 0;

    const begin = (x: number, y: number) => {
      clearTimeout(holdTimer);
      setPressed(null);
      const d: Drag = { source, phase: 'drag', target: null, dx: start.x - rect.left, dy: start.y - rect.top, w: rect.width, h: rect.height };
      setPointer({ x, y });
      setDrag(d);
      document.body.classList.add('fb-grabbing');
      // The click that follows a drag must not also select or add.
      const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 400);
      opts.onLift(d);
      update(x, y);
      raf = requestAnimationFrame(autoScroll);
    };

    const onMove = (ev: PointerEvent) => {
      if (drag()) return update(ev.clientX, ev.clientY);
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (touch) { if (dist > SCROLL_PX) stop(); }
      else if (dist >= START_PX) begin(ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => (drag() ? end(ev.clientX, ev.clientY) : stop());
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !drag()) return;
      ev.preventDefault();
      ev.stopPropagation();
      cancel();
    };
    const onLost = () => (drag() ? cancel() : stop());
    const onTouchMove = (ev: TouchEvent) => { if (drag()) ev.preventDefault(); }; // only while a drag is active
    const onContext = (ev: Event) => { if (drag()) { ev.preventDefault(); cancel(); } };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onLost);
    window.addEventListener('blur', onLost);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('contextmenu', onContext);
    detach = () => {
      clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onLost);
      window.removeEventListener('blur', onLost);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('contextmenu', onContext);
    };
    if (touch) holdTimer = window.setTimeout(() => { navigator.vibrate?.(8); begin(start.x, start.y); }, HOLD_MS);
  }

  return { drag, pointer, pressed, scrolling, press, clear, goHome, cancel };
}

export type Dnd = ReturnType<typeof createDnd>;

const num = (el: HTMLElement, key: string) => Number(el.dataset[key] ?? 0);
const newRowAt = (line: HTMLElement): Target => ({ type: 'newrow', sectionId: line.dataset.fbSec!, index: num(line, 'fbAt') });

/**
 * Which target the pointer is on (DragAndDrop.md §3, first match wins). Reads the DOM contract (§2):
 * [data-fb-section], [data-fb-sec-h], [data-fb-dropline], [data-fb-row][data-fb-cols], [data-fb-col] (column id),
 * [data-fb-block][data-fb-index], [data-fb-slot], and [data-fb-secbar] in outline mode.
 */
export function hitTest(canvas: HTMLElement, source: Source, x: number, y: number, current: Target | null): Target | null {
  const box = canvas.getBoundingClientRect();
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;

  if (source.type === 'section') {
    // Outline mode: before the first bar whose middle is below the pointer.
    const bars = [...canvas.querySelectorAll<HTMLElement>('[data-fb-secbar]')];
    const i = bars.findIndex((bar) => { const r = bar.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return { type: 'section', index: i < 0 ? bars.length : i };
  }

  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el || !canvas.contains(el)) return null;
  // 1. Over the landing slot: keep the current target (the slot is its preview).
  if (el.closest('[data-fb-slot]')) return current;
  // 2. Over a "New row" line.
  const line = el.closest<HTMLElement>('[data-fb-dropline]');
  if (line) return newRowAt(line);
  const section = el.closest<HTMLElement>('[data-fb-section]');
  if (!section) return null;
  // 3. Within 14px of a row gap (the gaps are the section's "New row" lines).
  let near: { line: HTMLElement; dist: number } | null = null;
  for (const l of section.querySelectorAll<HTMLElement>('[data-fb-dropline]')) {
    const r = l.getBoundingClientRect();
    const dist = Math.abs(y - (r.top + r.height / 2));
    if (!near || dist < near.dist) near = { line: l, dist };
  }
  if (near && near.dist <= GAP_PX) return newRowAt(near.line);
  // Rows only land in row gaps: the nearest one.
  if (source.type === 'row') return near ? newRowAt(near.line) : null;
  // A section header: top of that section.
  if (el.closest('[data-fb-sec-h]')) return { type: 'newrow', sectionId: section.dataset.fbSection!, index: 0 };

  const block = el.closest<HTMLElement>('[data-fb-block]');
  if (block) {
    if (source.type === 'block' && block.dataset.fbBlock === source.id) return current; // over its own ghost
    const r = block.getBoundingClientRect();
    const rx = (x - r.left) / r.width;
    const row = block.closest<HTMLElement>('[data-fb-row]')!;
    // 4. Outer 22% left or right: a new column, unless the row is full.
    if (rx < 0.22 || rx > 0.78) {
      if (num(row, 'fbCols') >= MAX_COLUMNS) return { type: 'invalid', rowId: row.dataset.fbRow!, reason: `Rows hold up to ${MAX_COLUMNS} columns` };
      return { type: 'side', rowId: row.dataset.fbRow!, blockId: block.dataset.fbBlock!, side: rx < 0.22 ? 'left' : 'right' };
    }
    // 5. Middle: insert above (top half) or below (bottom half) in that column.
    const col = block.closest<HTMLElement>('[data-fb-col]')!;
    return { type: 'column', columnId: col.dataset.fbCol!, index: num(block, 'fbIndex') + (y > r.top + r.height / 2 ? 1 : 0) };
  }
  // 6. An empty column, or below a column's last block: the end of that column.
  const col = el.closest<HTMLElement>('[data-fb-col]');
  if (col) return { type: 'column', columnId: col.dataset.fbCol!, index: num(col, 'fbCount') };
  // 7. Inside the section but not on a row: the nearest row gap.
  return near ? newRowAt(near.line) : null;
}
