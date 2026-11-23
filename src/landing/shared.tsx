// Shared parts of the two landing pages (Paper and Arcade, from the design system).
import { createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { REPO_SLUG, REPO_URL } from '../../shared/repo';
import { Icon } from '../ui/icons';
import { scrollToId } from '../ui/kit';

export const REPO = REPO_URL;
export const DOCS = `${REPO}#readme`;
export const INSTALL = 'docker compose up -d';

/** In-page link: scroll to the section, keep the URL as it is. */
export const jump = (id: string) => (e: MouseEvent) => { e.preventDefault(); scrollToId(id); };

const CHECK = '<path d="M5 12.5l4.5 4.5L19 7"/>';
const timers = new WeakMap<HTMLButtonElement, number>();

/**
 * Copy the install command. For 1.8 s the icon turns into a tick and a "Copied" bubble shows above the button
 * (app.css: .lp-copy-msg); a live region tells screen readers. If the browser blocks the clipboard, the bubble says so.
 */
export async function copyCmd(e: MouseEvent) {
  const btn = e.currentTarget as HTMLButtonElement;
  const svg = btn.querySelector('svg')!;
  if (!btn.dataset.icon) btn.dataset.icon = svg.innerHTML;
  let ok = true;
  try { await navigator.clipboard.writeText(INSTALL); } catch { ok = legacyCopy(INSTALL); }
  const msg = ok ? 'Copied' : "Couldn't copy. Select the command and copy it.";
  btn.dataset.copy = ok ? 'ok' : 'err';
  btn.dataset.msg = msg;
  if (ok) svg.innerHTML = CHECK;
  announce(msg);
  clearTimeout(timers.get(btn));
  timers.set(btn, window.setTimeout(() => {
    delete btn.dataset.copy;
    svg.innerHTML = btn.dataset.icon!;
  }, ok ? 1800 : 3500));
}

/** Fallback where the Clipboard API is missing or blocked (for example a server on plain http in a LAN). */
function legacyCopy(text: string): boolean {
  const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  const back = document.activeElement as HTMLElement | null;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* not supported */ }
  ta.remove();
  back?.focus({ preventScroll: true });
  return ok;
}

/** One polite live region for the page, so screen readers hear the copy result. */
function announce(text: string) {
  let el = document.getElementById('lp-live');
  if (!el) {
    el = Object.assign(document.createElement('div'), { id: 'lp-live', className: 'fb-sr' });
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = '';
  setTimeout(() => (el!.textContent = text), 50); // a fresh change, so the same message is read again
}

/** The hero intro plays once per visit (design system: LogoMotion). */
export function introOnce(): boolean {
  try {
    if (sessionStorage.getItem('fb-intro')) return false;
    sessionStorage.setItem('fb-intro', '1');
  } catch { /* storage blocked: play it */ }
  return true;
}

/** Phone and tablet nav: the section links move into this menu. */
export function LandingMenu(props: { links: { label: string; section?: string; href?: string }[] }) {
  const [open, setOpen] = createSignal(false);
  let box!: HTMLDivElement;
  const onDoc = (e: MouseEvent) => { if (!box.contains(e.target as Node)) setOpen(false); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
  onMount(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); });
  onCleanup(() => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); });
  return (
    <div ref={box} class="lp-menu-box">
      <button type="button" class="fb-btn fb-btn--ghost fb-btn--icon lp-menu" aria-label="Menu" aria-haspopup="menu" aria-expanded={open()} onClick={() => setOpen(!open())}>
        <svg class="fb-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h16M4 14h16M4 18h10" /></svg>
      </button>
      <Show when={open()}>
        <div class="fb-menu lp-sheet" role="menu" aria-label="Menu">
          <For each={props.links}>
            {(l) => (
              <button type="button" role="menuitem" onClick={() => {
                setOpen(false);
                if (l.section) scrollToId(l.section);
                else if (l.href) location.href = l.href;
              }}>{l.label}</button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** "Star on GitHub" box: a star and the live count (our server asks GitHub, cached for an hour). Opens the repo. */
export function StarBox() {
  const [stars] = createResource(async () => {
    try { return ((await (await fetch('/api/stars')).json()).stars as number | null) ?? null; } catch { return null; }
  });
  const count = () => (typeof stars() === 'number' ? new Intl.NumberFormat('en', { notation: 'compact' }).format(stars()!) : null);
  return (
    <a class="lp-star" href={REPO} target="_blank" rel="noopener"
      aria-label={`Star ${REPO_SLUG} on GitHub${count() !== null ? `, ${stars()} ${stars() === 1 ? 'star' : 'stars'}` : ''}`}>
      <span class="lp-star-l"><Icon name="star" size="sm" />Star</span>
      <Show when={count() !== null}><span class="lp-star-n fb-num" aria-hidden="true">{count()}</span></Show>
    </a>
  );
}
