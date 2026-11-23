// A tiny client router: the admin has only three views.
import { createSignal, type JSX } from 'solid-js';

const [path, setPath] = createSignal(location.pathname);
window.addEventListener('popstate', () => setPath(location.pathname));
export { path };

/** Set by the editor while it has unsaved changes. Returns false to stay on the page. */
export let leaveGuard: (() => boolean) | null = null;
export const setLeaveGuard = (g: typeof leaveGuard) => (leaveGuard = g);

/** One-time hints for the next page, passed in memory so the URL stays clean (for example: open the QR tab). */
export const handoff: { editorMode: 'edit' | 'preview' | 'qr' | null } = { editorMode: null };

export function navigate(to: string) {
  if (leaveGuard && !leaveGuard()) return;
  leaveGuard = null;
  history.pushState(null, '', to);
  // Cross-fade between pages where the browser supports it, unless the owner asks for less motion.
  const swap = () => { setPath(to); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(swap);
  else swap();
}

export function Link(props: { href: string; class?: string; children: JSX.Element; title?: string; style?: JSX.CSSProperties; 'aria-label'?: string }) {
  return (
    <a href={props.href} class={props.class} title={props.title} style={props.style} aria-label={props['aria-label']}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(props.href);
      }}>
      {props.children}
    </a>
  );
}
