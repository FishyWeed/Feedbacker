// Drag-and-drop motion (design system: DragAndDrop.md §5). Web Animations only; animates transform, opacity and
// box-shadow, never layout. Every helper does nothing under prefers-reduced-motion: the change still happens, instantly.

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Timings and easing, from the design tokens. */
export const MOTION = {
  hover: 120, lift: 140, base: 180, drop: 220, flash: 900,
  standard: 'cubic-bezier(.2,0,0,1)', out: 'cubic-bezier(.16,1,.3,1)', dropEase: 'cubic-bezier(.34,1.32,.64,1)',
};

/** Every FLIP target carries data-fb-flip="b:<id>" (block), "r:<id>" (row header) or "s:<id>" (section header). */
const targets = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-fb-flip]')];

/**
 * First: where everything is now. Taken mid-animation this includes the running transform, so an interrupted
 * slide continues smoothly from where it is.
 */
export function snapshot(root: ParentNode = document): Map<string, DOMRect> {
  const m = new Map<string, DOMRect>();
  for (const el of targets(root)) m.set(el.dataset.fbFlip!, el.getBoundingClientRect());
  return m;
}

/** Last, Invert, Play: slide everything that moved from its old place to its new one. */
export function flip(before: Map<string, DOMRect>, opts: { root?: ParentNode; skip?: string } = {}) {
  if (reducedMotion()) return;
  for (const el of targets(opts.root ?? document)) {
    const key = el.dataset.fbFlip!;
    const was = before.get(key);
    if (!was || key === opts.skip) continue;
    for (const a of el.getAnimations()) if (a.id === 'fb-flip') a.cancel();
    const now = el.getBoundingClientRect();
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    const a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: MOTION.base, easing: MOTION.standard });
    a.id = 'fb-flip';
  }
}

const shadow = (el: Element, token: string) => getComputedStyle(el).getPropertyValue(token).trim() || 'none';

/** Drop settle: the placed block flies from the overlay's release rect into place, losing tilt and scale; then flashes. */
export function settle(el: HTMLElement, from: DOMRect | null) {
  const flash = () => { el.classList.add('is-landed'); setTimeout(() => el.classList.remove('is-landed'), MOTION.flash); };
  if (reducedMotion() || !from) return flash();
  const now = el.getBoundingClientRect();
  const dx = from.left - now.left;
  const dy = from.top - now.top;
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) rotate(-1.2deg) scale(1.02)`, boxShadow: shadow(el, '--shadow-drag') },
      { transform: 'none', boxShadow: shadow(el, '--shadow-card') },
    ],
    { duration: MOTION.drop, easing: MOTION.dropEase },
  ).finished.then(flash, flash);
}

/** Cancel: the overlay copy flies back to the original (block) and loses its tilt. Resolves when it lands. */
export function flyBack(overlay: HTMLElement, to: DOMRect | null): Promise<unknown> {
  if (reducedMotion()) return Promise.resolve();
  const card = overlay.firstElementChild as HTMLElement | null;
  if (!to || !card) return fade(overlay);
  const from = overlay.getBoundingClientRect();
  card.animate([{ transform: 'rotate(-1.2deg) scale(1.02)' }, { transform: 'none' }], { duration: MOTION.drop, easing: MOTION.out, fill: 'forwards' });
  return overlay
    .animate([{ transform: 'none' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)` }], { duration: MOTION.drop, easing: MOTION.out, fill: 'forwards' })
    .finished.catch(() => undefined);
}

/** Cancel of a palette item, row or page: the overlay fades and shrinks to 0.96. */
export function fade(overlay: HTMLElement): Promise<unknown> {
  if (reducedMotion()) return Promise.resolve();
  return overlay
    .animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: MOTION.hover, easing: MOTION.standard, fill: 'forwards' })
    .finished.catch(() => undefined);
}
